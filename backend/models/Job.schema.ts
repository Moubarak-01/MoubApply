import mongoose, { Schema, Document } from 'mongoose';

export interface IJob extends Document {
  title: string;
  company: string;
  rawDescription: string;
  applyLink?: string;
  externalId?: string;
  matchScore: number;
  tags: string[];
  gradYearReq: number;
  aiSummary: {
    whyYouWillLoveIt: string[];
    theCatch: string[];
    topSkills: string[];
  };
  createdAt: Date;
  updatedAt: Date;
}

const JobSchema: Schema = new Schema({
  title: { type: String, required: true },
  company: { type: String, required: true },
  rawDescription: { type: String, required: true },
  applyLink: { type: String },
  externalId: { type: String, unique: true },
  matchScore: { type: Number, default: 0 },
  tags: [{ type: String }],
  gradYearReq: { type: Number, required: true },
  aiSummary: {
    whyYouWillLoveIt: [{ type: String }],
    theCatch: [{ type: String }],
    topSkills: [{ type: String }],
  }
}, { timestamps: true });

export const Job = mongoose.model<IJob>('Job', JobSchema);
