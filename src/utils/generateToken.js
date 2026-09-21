import jwt from 'jsonwebtoken';

/**
 * Generate a signed JWT for authenticated user
 * Contains only minimal safe payload: userId (id) and role
 * @param {string} id - MongoDB User _id
 * @param {string} role - 'customer' or 'admin'
 * @returns {string} - Signed JWT token
 */
export const generateToken = (id, role) => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is not defined');
  }

  return jwt.sign(
    {
      id,
      role,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    }
  );
};

export default generateToken;
