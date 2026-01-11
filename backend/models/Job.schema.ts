import mongoose, { Schema, Document } from 'mongoose';

export interface IJob extends Document {
  title: string;
  company: string;
  rawDescription: string;
  matchScore: number;
  tags: string[];
  gradYearReq: number;
  aiSummary: {
    whyYouWillLoveIt: string;
    theCatch: string;
    topSkills: string[];
  };
  createdAt: Date;
  updatedAt: Date;
}

const JobSchema: Schema = new Schema({
  title: { type: String, required: true },
  company: { type: String, required: true },
  rawDescription: { type: String, required: true },
  matchScore: { type: Number, required: true },
  tags: [{ type: String }],
  gradYearReq: { type: Number, required: true },
  aiSummary: {
    whyYouWillLoveIt: { type: String },
    theCatch: { type: String },
    topSkills: [{ type: String }],
  }
}, { timestamps: true });

export const Job = mongoose.model<IJob>('Job', JobSchema);
