const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const User = require('../models/User');

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const sanitizeUser = (user) => ({
    id: user._id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl || '',
    provider: user.provider || 'local',
    lastLogin: user.lastLogin,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
});

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const validatePassword = (password) => {
    if (!password || String(password).length < 8) {
        return 'Password must be at least 8 characters.';
    }
    return '';
};

const signToken = (user) => jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d'
});

const getCookieOptions = () => {
    const days = Number.parseInt(process.env.JWT_COOKIE_EXPIRE || '7', 10);

    return {
        expires: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
    };
};

const sendTokenResponse = (user, statusCode, res) => {
    const token = signToken(user);

    res
        .status(statusCode)
        .cookie('dailydrop_token', token, getCookieOptions())
        .json({
            success: true,
            token,
            user: sanitizeUser(user)
        });
};

const getResetUrl = (req, resetToken) => {
    const protocol = req.protocol;
    const host = req.get('host');
    return `${protocol}://${host}/reset-password.html?token=${resetToken}`;
};

const sendPasswordResetEmail = async ({ email, resetUrl }) => {
    if (!process.env.SMTP_HOST) {
        if (process.env.NODE_ENV === 'production') {
            throw new Error('Password reset email is not configured.');
        }
        console.log(`DailyDrop password reset link for ${email}: ${resetUrl}`);
        return;
    }

    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === 'true',
        auth: process.env.SMTP_USER && process.env.SMTP_PASS ? {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        } : undefined
    });

    await transporter.sendMail({
        to: email,
        from: process.env.SMTP_FROM || 'DailyDrop <no-reply@dailydrop.local>',
        subject: 'Reset your DailyDrop password',
        text: [
            'Use this secure link to reset your DailyDrop password:',
            resetUrl,
            '',
            'This link expires in 30 minutes. If you did not request it, you can ignore this email.'
        ].join('\n')
    });
};

exports.signup = async (req, res) => {
    try {
        const name = String(req.body.name || '').trim();
        const email = normalizeEmail(req.body.email);
        const password = String(req.body.password || '');

        if (!name) {
            return res.status(400).json({ success: false, message: 'Name is required.' });
        }
        if (!emailRegex.test(email)) {
            return res.status(400).json({ success: false, message: 'Please enter a valid email address.' });
        }

        const passwordError = validatePassword(password);
        if (passwordError) {
            return res.status(400).json({ success: false, message: passwordError });
        }

        const userExists = await User.findOne({ email });
        if (userExists) {
            return res.status(409).json({ success: false, message: 'An account with this email already exists.' });
        }

        const user = new User({
            name,
            email,
            provider: 'local',
            lastLogin: new Date()
        });
        user.plainPassword = password;
        await user.save();

        sendTokenResponse(user, 201, res);
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({ success: false, message: 'An account with this email already exists.' });
        }
        res.status(500).json({ success: false, message: 'Unable to create account right now.' });
    }
};

exports.login = async (req, res) => {
    try {
        const email = normalizeEmail(req.body.email);
        const password = String(req.body.password || '');

        if (!emailRegex.test(email) || !password) {
            return res.status(400).json({ success: false, message: 'Please provide a valid email and password.' });
        }

        const user = await User.findOne({ email }).select('+passwordHash +password');
        if (!user || !(await user.matchPassword(password))) {
            return res.status(401).json({ success: false, message: 'Invalid email or password.' });
        }

        if (!user.passwordHash && user.password) {
            user.plainPassword = password;
        }
        user.lastLogin = new Date();
        await user.save();

        sendTokenResponse(user, 200, res);
    } catch (error) {
        res.status(500).json({ success: false, message: 'Unable to sign in right now.' });
    }
};

exports.logout = (req, res) => {
    res
        .status(200)
        .cookie('dailydrop_token', 'loggedout', {
            expires: new Date(Date.now() + 10 * 1000),
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
        })
        .json({ success: true, message: 'Logged out successfully.' });
};

exports.getMe = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'Account not found.' });
        }

        res.status(200).json({
            success: true,
            user: sanitizeUser(user)
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Unable to load profile.' });
    }
};

exports.forgotPassword = async (req, res) => {
    try {
        const email = normalizeEmail(req.body.email);

        if (!emailRegex.test(email)) {
            return res.status(400).json({ success: false, message: 'Please enter a valid email address.' });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(200).json({
                success: true,
                message: 'If an account exists, a password reset link has been sent.'
            });
        }

        const resetToken = user.createPasswordResetToken();
        await user.save({ validateBeforeSave: false });

        const resetUrl = getResetUrl(req, resetToken);
        await sendPasswordResetEmail({ email, resetUrl });

        res.status(200).json({
            success: true,
            message: 'Password reset link sent.',
            resetUrl: process.env.NODE_ENV === 'production' ? undefined : resetUrl
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Unable to start password reset right now.' });
    }
};

exports.resetPassword = async (req, res) => {
    try {
        const token = String(req.params.token || req.body.token || '');
        const password = String(req.body.password || '');
        const passwordError = validatePassword(password);

        if (!token) {
            return res.status(400).json({ success: false, message: 'Reset token is required.' });
        }
        if (passwordError) {
            return res.status(400).json({ success: false, message: passwordError });
        }

        const resetPasswordTokenHash = crypto
            .createHash('sha256')
            .update(token)
            .digest('hex');

        const user = await User.findOne({
            resetPasswordTokenHash,
            resetPasswordExpires: { $gt: Date.now() }
        }).select('+resetPasswordTokenHash +resetPasswordExpires');

        if (!user) {
            return res.status(400).json({ success: false, message: 'Reset link is invalid or has expired.' });
        }

        user.plainPassword = password;
        user.provider = user.provider || 'local';
        user.resetPasswordTokenHash = undefined;
        user.resetPasswordExpires = undefined;
        user.lastLogin = new Date();
        await user.save();

        sendTokenResponse(user, 200, res);
    } catch (error) {
        res.status(500).json({ success: false, message: 'Unable to reset password right now.' });
    }
};

exports.googleCallback = async (req, res) => {
    if (!req.user) {
        return res.redirect('/signin.html?error=google-auth-failed');
    }

    const token = signToken(req.user);
    res.cookie('dailydrop_token', token, getCookieOptions());
    res.redirect('/index.html?auth=google');
};

exports.sendTokenResponse = sendTokenResponse;
exports.sanitizeUser = sanitizeUser;
