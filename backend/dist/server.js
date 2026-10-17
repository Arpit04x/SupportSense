"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.server = exports.app = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
const fs_1 = __importDefault(require("fs"));
const tickets_1 = require("./routes/tickets");
const reports_1 = require("./routes/reports");
const kb_1 = require("./routes/kb");
const reportJob_1 = require("./services/reportJob");
// Load environment variables
const rootEnv = path_1.default.resolve(__dirname, '../../.env');
if (fs_1.default.existsSync(rootEnv)) {
    dotenv_1.default.config({ path: rootEnv });
}
else {
    dotenv_1.default.config();
}
const app = (0, express_1.default)();
exports.app = app;
const PORT = parseInt(process.env.PORT || '3000', 10);
// Middleware
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
// Serve static frontend dashboard from public folder
const publicDir = path_1.default.resolve(__dirname, '../public');
app.use(express_1.default.static(publicDir));
// API Routes
app.use('/api/tickets', tickets_1.ticketsRouter);
app.use('/api/reports', reports_1.reportsRouter);
app.use('/api/kb', kb_1.kbRouter);
// Health check endpoint
app.get('/api/health', (_req, res) => {
    res.json({
        status: 'ok',
        service: 'SupportSense Backend',
        timestamp: new Date().toISOString(),
    });
});
// Custom 404 route
app.get('/404', (_req, res) => {
    res.status(404).sendFile(path_1.default.join(publicDir, '404.html'));
});
// API 404 handler for unknown endpoints
app.all('/api/*', (_req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});
// Main dashboard index route
app.get('/', (_req, res) => {
    res.sendFile(path_1.default.join(publicDir, 'index.html'));
});
// Custom 404 fallback for unrecognized page routes
app.get('*', (_req, res) => {
    res.status(404).sendFile(path_1.default.join(publicDir, '404.html'));
});
// Start Express server
const server = app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(` SupportSense Backend is running at http://localhost:${PORT}`);
    console.log(` Dashboard is available at http://localhost:${PORT}`);
    console.log(`=======================================================`);
    // Start scheduled node-cron job for weekly reporting
    (0, reportJob_1.initReportJob)();
});
exports.server = server;
