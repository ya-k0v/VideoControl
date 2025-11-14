/**
 * Biography Module - Main Export
 * Независимый модуль биографий с отдельной БД
 */

export { createBiographiesRouter } from './routes/biographies-router.js';
export { biographyQueries } from './database/queries.js';
export { biographiesDb } from './database/biographies-db.js';

