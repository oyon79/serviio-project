ALTER TABLE users
  MODIFY COLUMN role ENUM(
    'customer',
    'provider',
    'admin',
    'super_admin',
    'support_agent',
    'verification_officer'
  ) DEFAULT 'customer';
