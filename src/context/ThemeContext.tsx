import React, { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
    theme: Theme;
    toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

/**
 * Determines the theme based on time of day.
 * Day (6 AM - 6 PM) = light, Night = dark.
 */
const getTimeBasedTheme = (): Theme => {
    const hour = new Date().getHours();
    return (hour >= 6 && hour < 18) ? 'light' : 'dark';
};

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [theme, setTheme] = useState<Theme>(() => {
        if (typeof window !== 'undefined') {
            // Check if user has manually overridden
            const manualOverride = localStorage.getItem('themeManualOverride');
            if (manualOverride === 'true') {
                const savedTheme = localStorage.getItem('theme') as Theme;
                if (savedTheme) return savedTheme;
            }
            // Otherwise, use time-based theme
            return getTimeBasedTheme();
        }
        return 'light';
    });

    useEffect(() => {
        const root = window.document.documentElement;
        root.classList.remove('light', 'dark');
        root.classList.add(theme);
        localStorage.setItem('theme', theme);
    }, [theme]);

    // Auto-update theme every minute if not manually overridden
    useEffect(() => {
        const interval = setInterval(() => {
            const manualOverride = localStorage.getItem('themeManualOverride');
            if (manualOverride !== 'true') {
                const newTheme = getTimeBasedTheme();
                setTheme(newTheme);
            }
        }, 60000); // Check every minute

        return () => clearInterval(interval);
    }, []);

    const toggleTheme = () => {
        // User is manually toggling, so set the override flag
        localStorage.setItem('themeManualOverride', 'true');
        setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
    };

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (context === undefined) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
}
