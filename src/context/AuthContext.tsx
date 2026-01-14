import React, { createContext, useState, useEffect, useContext } from 'react';

interface User {
  _id: string;
  name: string;
  email: string;
  resumes?: any[];
  demographics?: {
    gender: string;
    race: string;
    veteran: string;
    disability: string;
  };
  commonReplies?: {
    workAuth: string;
    sponsorship: string;
    relocation: string;
    formerEmployee: string;
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
  preferences?: {
    location?: string;
    minMatchScore?: number;
    autoGenerateEssays?: boolean;
  };
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (token: string, user: User) => void;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  };

  useEffect(() => {
    const checkUser = async () => {
      if (token) {
        try {
          const res = await fetch('http://localhost:5000/api/auth/me', {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (res.ok) {
            const userData = await res.json();
            setUser(userData);
          } else {
            logout();
          }
        } catch {
          logout();
        }
      }
      setLoading(false);
    };
    checkUser();
  }, [token]);

  const login = (newToken: string, newUser: User) => {
    localStorage.setItem('token', newToken);
    localStorage.setItem('hasAccount', 'true'); // Mark as returning user
    setToken(newToken);
    setUser(newUser);
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};