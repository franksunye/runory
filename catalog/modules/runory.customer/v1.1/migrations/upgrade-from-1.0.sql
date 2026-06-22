-- Upgrade runory.customer from 1.0.0 to 1.1.0
-- Adds `industry` and `website` columns to the customer business table.
ALTER TABLE {{BUSINESS_TABLE_PREFIX}}customer ADD COLUMN industry TEXT;
ALTER TABLE {{BUSINESS_TABLE_PREFIX}}customer ADD COLUMN website TEXT;
