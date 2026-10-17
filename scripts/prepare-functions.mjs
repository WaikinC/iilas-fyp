import {copyFile} from 'node:fs/promises';
await copyFile(new URL('../lib/validation.js',import.meta.url),new URL('../backend/functions/validation.js',import.meta.url));
await copyFile(new URL('../lib/procurementValidation.js',import.meta.url),new URL('../backend/functions/procurementValidation.js',import.meta.url));
await copyFile(new URL('../lib/locationStock.js',import.meta.url),new URL('../backend/functions/locationStock.js',import.meta.url));
await copyFile(new URL('../lib/integrity.js',import.meta.url),new URL('../backend/functions/integrity.js',import.meta.url));
console.log('Shared validation prepared for Firebase Functions.');
