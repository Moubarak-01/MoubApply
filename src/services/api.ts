const API_URL = 'http://localhost:5000/api';

export const api = {
  // Applications
  apply: async (userId: string, jobId: string) => {
    const response = await fetch(`${API_URL}/applications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, jobId }),
    });
    if (!response.ok) throw new Error('Failed to apply');
    return response.json();
  },

  updateUser: async (userId: string, data: any) => {
    const response = await fetch(`${API_URL}/user`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, ...data })
    });
    if (!response.ok) throw new Error('Failed to update user');
    return response.json();
  },


  rejectJob: async (userId: string, jobId: string) => {
    const response = await fetch(`${API_URL}/jobs/${jobId}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId })
    });
    if (!response.ok) throw new Error('Failed to delete file');
    return response.json();
  },

  createManualJob: async (userId: string, url: string) => {
    const response = await fetch(`${API_URL}/jobs/manual`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, url })
    });
    if (!response.ok) throw new Error('Failed to create manual job');
    return response.json();
  },

  // Jobs (We need to add this route to backend first, but let's prepare the frontend)
  // Jobs
  getJobs: async (userId?: string) => {
    const url = userId ? `${API_URL}/jobs?userId=${userId}` : `${API_URL}/jobs`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch jobs');
    return response.json();
  },

  // User
  // User
  getUser: async (token?: string) => {
    if (!token) {
      // Fallback or error?
      const response = await fetch(`${API_URL}/user`);
      if (!response.ok) throw new Error('Failed to fetch user');
      return response.json();
    }
    const response = await fetch(`${API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) throw new Error('Failed to fetch user');
    return response.json();
  },

  // Applications List
  getApplications: async (userId: string) => {
    const response = await fetch(`${API_URL}/applications?userId=${userId}`);
    if (!response.ok) throw new Error('Failed to fetch applications');
    return response.json();
  },

  // Upload Resume/Files
  uploadFiles: async (userId: string, files: File[]) => {
    const formData = new FormData();
    formData.append('userId', userId);
    files.forEach(file => {
      formData.append('files', file);
    });

    const response = await fetch(`${API_URL}/user/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Failed to upload files');
    }
    return response.json();
  },

  // Delete File
  deleteFile: async (filename: string) => {
    const response = await fetch(`${API_URL}/user/files/${filename}`, {
      method: 'DELETE',
    });
    if (!response.ok) throw new Error('Failed to delete file');
    return response.json();
  },

  // AI Chat
  chatWithAI: async (userId: string, message: string) => {
    const response = await fetch(`${API_URL}/ai/assistant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, message })
    });
    if (!response.ok) throw new Error('AI Chat failed');
    return response.json();
  },

  // Tailor Resume
  tailorResume: async (appId: string) => {
    const response = await fetch(`${API_URL}/applications/${appId}/tailor`, {
      method: 'POST'
    });
    if (!response.ok) throw new Error('Tailoring failed');
    return response.json();
  },

  deleteAccount: async (userId: string) => {
    const response = await fetch(`${API_URL}/auth/delete-account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId })
    });
    if (!response.ok) throw new Error('Deletion failed');
    return response.json();
  }
};
