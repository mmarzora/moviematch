// Generate a random 6-digit code
export const generateSessionCode = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
}; 