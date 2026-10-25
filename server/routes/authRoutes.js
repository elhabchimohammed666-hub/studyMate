const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');

const router = express.Router();
const signToken = (user) => jwt.sign(
  { id: user._id.toString(), name: user.name },
  process.env.JWT_SECRET || 'studymate-development-secret',
  { expiresIn: '7d' }
);
const publicUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  createdAt: user.createdAt
});

router.post('/register', async (req, res) => {
  try {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';

    if (!name || name.length > 80 || email.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8 || password.length > 72) {
      return res.status(400).json({ message: 'Enter a name (up to 80 characters), a valid email, and a password between 8 and 72 characters.' });
    }
    if (await User.exists({ email })) {
      return res.status(409).json({ message: 'An account with this email already exists.' });
    }

    const user = await User.create({ name, email, password: await bcrypt.hash(password, 12) });
    res.status(201).json({ token: signToken(user), user: publicUser(user) });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: 'An account with this email already exists.' });
    console.error('Registration failed:', error);
    res.status(500).json({ message: 'Unable to create your account right now.' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: 'Email or password is incorrect.' });
    }
    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (error) {
    console.error('Login failed:', error);
    res.status(500).json({ message: 'Unable to sign in right now.' });
  }
});

router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ message: 'Account not found.' });
    res.json({ user: publicUser(user) });
  } catch (error) {
    console.error('Profile lookup failed:', error);
    res.status(500).json({ message: 'Unable to load your profile.' });
  }
});

router.patch('/me', authMiddleware, async (req, res) => {
  try {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (!name || name.length > 80 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: 'Enter a name and a valid email address.' });
    }

    const duplicate = await User.exists({ email, _id: { $ne: req.user.id } });
    if (duplicate) return res.status(409).json({ message: 'This email is already in use.' });
    const user = await User.findByIdAndUpdate(req.user.id, { name, email }, { new: true, runValidators: true }).select('-password');
    if (!user) return res.status(404).json({ message: 'Account not found.' });
    res.json({ user: publicUser(user) });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: 'This email is already in use.' });
    console.error('Profile update failed:', error);
    res.status(500).json({ message: 'Unable to update your profile right now.' });
  }
});

module.exports = router;
