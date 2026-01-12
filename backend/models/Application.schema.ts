import mongoose, { Schema, Document } from 'mongoose';

export enum ApplicationStatus {
  QUEUED = 'Queued',
  PROCESSING = 'Processing',
  APPLIED = 'Applied',
  ACTION_NEEDED = 'Action Needed',
}

export interface IApplication extends Document {
  userId: mongoose.Types.ObjectId;
  jobId: mongoose.Types.ObjectId;
  status: ApplicationStatus;
  tailoredPdfUrl?: string;
  coverLetter?: string;
  appliedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ApplicationSchema: Schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  jobId: { type: Schema.Types.ObjectId, ref: 'Job', required: true },
  status: {
    type: String,
    enum: Object.values(ApplicationStatus),
    default: ApplicationStatus.QUEUED,
    required: true
  },
  tailoredPdfUrl: { type: String },
  coverLetter: { type: String },
  appliedAt: { type: Date, default: Date.now }
}, { timestamps: true });

// Add compound unique index to prevent duplicate applications
ApplicationSchema.index({ userId: 1, jobId: 1 }, { unique: true });

export const Application = mongoose.model<IApplication>('Application', ApplicationSchema);
