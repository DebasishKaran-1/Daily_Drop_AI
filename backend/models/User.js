const crypto = require('crypto');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const userSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, 'Please add a name'],
            trim: true,
            maxlength: 80
        },
        email: {
            type: String,
            required: [true, 'Please add an email'],
            unique: true,
            lowercase: true,
            trim: true,
            match: [emailRegex, 'Please add a valid email']
        },
        passwordHash: {
            type: String,
            select: false
        },
        // Legacy field kept so older users created before passwordHash still work.
        password: {
            type: String,
            select: false
        },
        googleId: {
            type: String,
            sparse: true
        },
        avatarUrl: {
            type: String,
            default: ''
        },
        provider: {
            type: String,
            enum: ['local', 'google'],
            default: 'local'
        },
        lastLogin: {
            type: Date,
            default: null
        },
        resetPasswordTokenHash: {
            type: String,
            select: false
        },
        resetPasswordExpires: {
            type: Date,
            select: false
        }
    },
    {
        timestamps: true
    }
);

userSchema.virtual('plainPassword')
    .set(function (password) {
        this._plainPassword = password;
    });

userSchema.pre('save', async function () {
    if (!this._plainPassword) {
        return;
    }

    const salt = await bcrypt.genSalt(12);
    this.passwordHash = await bcrypt.hash(this._plainPassword, salt);
    this.password = undefined;
    this._plainPassword = undefined;
});

userSchema.methods.matchPassword = async function (enteredPassword) {
    const hash = this.passwordHash || this.password;
    if (!hash) return false;

    return bcrypt.compare(enteredPassword, hash);
};

userSchema.methods.createPasswordResetToken = function () {
    const resetToken = crypto.randomBytes(32).toString('hex');

    this.resetPasswordTokenHash = crypto
        .createHash('sha256')
        .update(resetToken)
        .digest('hex');
    this.resetPasswordExpires = Date.now() + 1000 * 60 * 30;

    return resetToken;
};

module.exports = mongoose.model('User', userSchema);
