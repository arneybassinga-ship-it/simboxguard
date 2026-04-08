import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Role } from '../../types';

interface AuthGuardProps {
  children: React.ReactNode;
  allowedRoles?: Role[];
}

export const AuthGuard: React.FC<AuthGuardProps> = ({ children, allowedRoles }) => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const storedUser = localStorage.getItem('currentUser');
    if (!storedUser) {
      navigate('/');
      return;
    }

    const parsedUser = JSON.parse(storedUser) as User;
    if (allowedRoles && !allowedRoles.includes(parsedUser.role)) {
      navigate('/unauthorized');
      return;
    }

    setUser(parsedUser);
  }, [navigate, allowedRoles]);

  if (!user) return null;

  return <>{children}</>;
};