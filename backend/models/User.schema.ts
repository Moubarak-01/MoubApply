import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  name: string;
  email: string;
  masterResumeText: string;
  gradYear: number;
  preferences: {
    location: 'Remote' | 'Hybrid' | 'Onsite';
    minMatchScore: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema: Schema = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  masterResumeText: { type: String, required: true },
  gradYear: { type: Number, required: true },
  preferences: {
    location: { 
      type: String, 
      enum: ['Remote', 'Hybrid', 'Onsite'], 
      default: 'Remote' 
    },
    minMatchScore: { type: Number, default: 80 },
  }
}, { timestamps: true });

export const User = mongoose.model<IUser>('User', UserSchema);
