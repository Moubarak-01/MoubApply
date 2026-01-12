import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  name: string;
  email: string;
  password?: string; // Hashed password
  masterResumeText: string;
  resumes: {
    originalName: string;
    filename: string;
    path: string;
    mimetype: string;
    uploadedAt: Date;
  }[];
  gradYear: number;
  preferences: {
    location: 'Remote' | 'Hybrid' | 'Onsite';
    minMatchScore: number;
  };
  structuredExperience?: {
    personalInfo: {
      fullName: string;
      phone: string;
      email: string;
      linkedin: string;
      github: string;
    };
    education: {
      institution: string;
      location: string;
      degree: string;
      dates: string;
      gpa: string;
      coursework: string;
    }[];
    experience: {
      company: string;
      role: string;
      location: string;
      dates: string;
      points: string[];
    }[];
    projects: {
      title: string;
      technologies: string;
      date: string;
      points: string[];
      link?: string;
    }[];
    skills: {
      languages: string;
      frontend: string;
      backend: string;
      aiMl: string;
      tools: string;
    };
    honors: string[];
  };
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema: Schema = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  masterResumeText: { type: String, default: '' },
  resumes: [{
    originalName: String,
    filename: String,
    path: String,
    mimetype: String,
    uploadedAt: { type: Date, default: Date.now }
  }],
  gradYear: { type: Number, default: 2026 },
  preferences: {
    location: { 
      type: String, 
      enum: ['Remote', 'Hybrid', 'Onsite'], 
      default: 'Remote' 
    },
    minMatchScore: { type: Number, default: 80 },
  },
  structuredExperience: { type: Schema.Types.Mixed }
}, { timestamps: true });

export const User = mongoose.model<IUser>('User', UserSchema);
