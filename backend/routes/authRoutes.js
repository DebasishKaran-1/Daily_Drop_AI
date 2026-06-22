const express = require('express');
const crypto = require('crypto');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const {
    signup,
    login,
    logout,
    getMe,
    forgotPassword,
    resetPassword,
    googleCallback
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');
const User = require('../models/User');

const router = express.Router();

const googleConfigured = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

const oauthCookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 10 * 60 * 1000
};

if (googleConfigured) {
    passport.use(new GoogleStrategy(
        {
            clientID: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            callbackURL: process.env.GOOGLE_CALLBACK_URL || '/auth/google/callback'
        },
        async (accessToken, refreshToken, profile, done) => {
            try {
                const email = profile.emails?.[0]?.value?.toLowerCase();
                if (!email) {
                    return done(null, false);
                }

                const avatarUrl = profile.photos?.[0]?.value || '';
                let user = await User.findOne({
                    $or: [
                        { googleId: profile.id },
                        { email }
                    ]
                });

                if (!user) {
                    user = await User.create({
                        name: profile.displayName || email.split('@')[0],
                        email,
                        googleId: profile.id,
                        avatarUrl,
                        provider: 'google',
                        lastLogin: new Date()
                    });
                } else {
                    user.googleId = user.googleId || profile.id;
                    user.avatarUrl = avatarUrl || user.avatarUrl;
                    user.name = user.name || profile.displayName || email.split('@')[0];
                    user.provider = 'google';
                    user.lastLogin = new Date();
                    await user.save();
                }

                return done(null, user);
            } catch (error) {
                return done(error);
            }
        }
    ));
}

router.post('/signup', signup);
router.post('/login', login);
router.post('/logout', logout);
router.get('/me', protect, getMe);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password/:token', resetPassword);
router.post('/reset-password', resetPassword);

router.get('/google', (req, res, next) => {
    if (!googleConfigured) {
        return res.redirect('/signin.html?error=google-not-configured');
    }

    const state = crypto.randomBytes(24).toString('hex');
    res.cookie('dailydrop_oauth_state', state, oauthCookieOptions);

    passport.authenticate('google', {
        scope: ['profile', 'email'],
        session: false,
        prompt: 'select_account',
        state
    })(req, res, next);
});

router.get(
    '/google/callback',
    (req, res, next) => {
        const expectedState = req.cookies?.dailydrop_oauth_state;
        res.clearCookie('dailydrop_oauth_state', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
        });

        if (!expectedState || expectedState !== req.query.state) {
            return res.redirect('/signin.html?error=google-auth-failed');
        }

        next();
    },
    passport.authenticate('google', {
        failureRedirect: '/signin.html?error=google-auth-failed',
        session: false
    }),
    googleCallback
);

module.exports = router;
