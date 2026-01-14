import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Request, Response } from 'express';
import { User } from '../models/User.schema';
import { Application } from '../models/Application.schema';
import fs from 'fs';
import path from 'path';

const JWT_SECRET = process.env.JWT_SECRET || 'moubapply_secret_key_123';

export const signup = async (req: Request, res: Response): Promise<any> => {
  try {
    const { name, email, password } = req.body;
    console.log(`📝 [TELEMETRY] Signup attempt - Email: ${email}, Name: ${name}`);

    if (!name || !email || !password) {
      console.warn(`⚠️ [TELEMETRY] Signup failed - Missing fields for ${email}`);
      return res.status(200).json({ error: 'Please provide all fields' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      console.warn(`⚠️ [TELEMETRY] Signup failed - Email already registered: ${email}`);
      return res.status(200).json({
        error: 'Email already registered. Please login instead.',
        shouldRedirectToLogin: true
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = new User({
      name,
      email,
      password: hashedPassword,
      masterResumeText: '', // Empty until upload
      resumes: [],
      gradYear: 2026 // Default
    });

    await user.save();

    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '7d' });
    console.log(`✅ [TELEMETRY] Signup successful - User created: ${user._id} (${email})`);

    res.status(201).json({ token, user: { _id: user._id, name: user.name, email: user.email, resumes: user.resumes } });
  } catch (error) {
    console.error('❌ [TELEMETRY] Signup error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const login = async (req: Request, res: Response): Promise<any> => {
  try {
    const { email, password } = req.body;
    console.log(`🔐 [TELEMETRY] Login attempt - Email: ${email}`);

    const user = await User.findOne({ email });
    if (!user) {
      console.warn(`⚠️ [TELEMETRY] Login failed - User not found: ${email}`);
      return res.status(200).json({
        error: 'Account does not exist. Please create an account.',
        shouldRedirectToSignup: true
      });
    }

    // @ts-ignore
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      console.warn(`⚠️ [TELEMETRY] Login failed - Incorrect password for: ${email}`);
      return res.status(200).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '7d' });
    console.log(`✅ [TELEMETRY] Login successful - User: ${user._id} (${email})`);

    res.json({ token, user: { _id: user._id, name: user.name, email: user.email, resumes: user.resumes } });
  } catch (error) {
    console.error('❌ [TELEMETRY] Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const getMe = async (req: Request, res: Response): Promise<any> => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token' });

    const decoded: any = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password'); // Exclude password

    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json(user);
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// DELETE ACCOUNT
export const deleteAccount = async (req: Request, res: Response): Promise<any> => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'User ID required' });

    // 1. Find User to get resume files
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // 2. Delete resume files from disk
    if (user.resumes && user.resumes.length > 0) {
      for (const resume of user.resumes) {
        try {
          // Files are stored in backend/uploads/, this file is in backend/services/
          const filename = path.basename(resume.path);
          const filePath = path.join(__dirname, '..', 'uploads', filename);

          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`🗑️ Deleted file: ${filePath}`);
          } else {
            console.warn(`⚠️ File not found: ${filePath}`);
          }
        } catch (fileErr) {
          console.error(`❌ Error deleting file ${resume.path}:`, fileErr);
        }
      }
    }

    // 3. Delete associated Applications
    await Application.deleteMany({ userId });

    // 4. Delete User
    await User.findByIdAndDelete(userId);

    console.log(`🗑️ Account Permanently Deleted: ${userId}`);
    res.json({ message: 'Account and all associated data permanently deleted' });
  } catch (err) {
    console.error('Delete account error:', err);
    res.status(500).json({ error: 'Failed to delete account' });
  }
};

