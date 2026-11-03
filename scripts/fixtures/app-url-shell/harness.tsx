import React from 'react';
import {createRoot} from 'react-dom/client';
import Home from '../../../app/page';
import '../../../app/globals.css';
import '../../../app/dispatch.css';
import '../../../app/dashboard.css';
import '../../../app/products.css';
import '../../../app/improvements.css';
import '../../../src/features/stock/stock.css';
import '../../../src/features/warehouse/warehouse.css';
import '../../../src/features/operations/operations.css';
import '../../../app/interface.css';

// Home owns the actual router, authentication gate and shared staff shell.
createRoot(document.getElementById('root')!).render(<React.StrictMode><Home/></React.StrictMode>);
