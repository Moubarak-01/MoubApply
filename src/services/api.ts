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

  // Jobs (We need to add this route to backend first, but let's prepare the frontend)
  getJobs: async () => {
    const response = await fetch(`${API_URL}/jobs`);
    if (!response.ok) throw new Error('Failed to fetch jobs');
    return response.json();
  },

  // User
  getUser: async () => {
    const response = await fetch(`${API_URL}/user`);
    if (!response.ok) throw new Error('Failed to fetch user');
    return response.json();
  },

  // Applications List
  getApplications: async (userId: string) => {
    const response = await fetch(`${API_URL}/applications?userId=${userId}`);
    if (!response.ok) throw new Error('Failed to fetch applications');
    return response.json();
  }
};
