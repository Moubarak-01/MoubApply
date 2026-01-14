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
    autoGenerateEssays: boolean;
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
  rejectedJobs: string[];
  demographics?: {
    gender: string;
    race: string;
    veteran: string;
    disability: string;
  };
  commonReplies?: {
    workAuth: string; // "Yes", "No"
    sponsorship: string; // "Yes", "No"
    relocation: string; // "Yes", "No"
    formerEmployee: string; // "Yes", "No"
  };
  personalDetails?: {
    phone: string;
    address: string;
    city: string;
    state: string;
    zip: string;
    linkedin: string;
    github: string;
    portfolio: string;
    university: string;
    degree: string;
    gpa: string;
    gradMonth: string;
    gradYear: string;
  };
  customAnswers?: {
    pronouns: string;
    conflictOfInterest: string;
    familyRel: string;
    govOfficial: string;
  };
  essayAnswers?: {
    whyExcited: string;
    howDidYouHear: string;
  };
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
    autoGenerateEssays: { type: Boolean, default: false }
  },
  structuredExperience: { type: Schema.Types.Mixed },
  rejectedJobs: [{ type: Schema.Types.ObjectId, ref: 'Job' }],
  demographics: {
    gender: { type: String, default: '' },
    race: { type: String, default: '' },
    veteran: { type: String, default: '' },
    disability: { type: String, default: '' }
  },
  commonReplies: {
    workAuth: { type: String, default: '' },
    sponsorship: { type: String, default: '' },
    relocation: { type: String, default: '' },
    formerEmployee: { type: String, default: '' }
  },
  personalDetails: {
    phone: { type: String, default: '' },
    address: { type: String, default: '' },
    city: { type: String, default: '' },
    state: { type: String, default: '' },
    zip: { type: String, default: '' },
    linkedin: { type: String, default: '' },
    github: { type: String, default: '' },
    portfolio: { type: String, default: '' },
    university: { type: String, default: '' },
    degree: { type: String, default: '' },
    gpa: { type: String, default: '' },
    gradMonth: { type: String, default: '' },
    gradYear: { type: String, default: '' }
  },
  customAnswers: {
    pronouns: { type: String, default: '' },
    conflictOfInterest: { type: String, default: 'No' },
    familyRel: { type: String, default: 'No' },
    govOfficial: { type: String, default: 'No' }
  },
  essayAnswers: {
    whyExcited: { type: String, default: '' },
    howDidYouHear: { type: String, default: '' }
  }
}, { timestamps: true });

export const User = mongoose.model<IUser>('User', UserSchema);
