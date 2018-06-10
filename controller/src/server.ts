//
// Master server, REST API and control point
// ---------------------------------------------
// Ben C, May 2018
//

// Load in modules, and create Express app 
import bodyParser from 'body-parser';
import logger from 'morgan';
import cors from 'cors';
import express from 'express';
import dotenv from 'dotenv';
import fs from 'fs';
import { API } from './api';

dotenv.config();

const app = express();
app.use(cors());
app.use(bodyParser.json())
app.use(bodyParser.raw({ limit: '100mb', type: 'application/octet-stream' }));
app.use(bodyParser.raw({ limit: '10mb', type: 'application/x-yaml' }));

// Set up logging
// if (app.get('env') === 'production') {
//     app.use(logger('combined'));
//   } else {
//     app.use(logger('dev'));
// }
console.log(`### Node environment mode is '${app.get('env')}'`);

var webUIDir = `${__dirname}/../webui`;
var jobOutDir = process.env.JOB_OUTPUT || `${__dirname}/../jobs`;

// Creat job dir
if (!fs.existsSync(jobOutDir)){
  fs.mkdirSync(jobOutDir);
}

// Routing here!
const api = new API(jobOutDir);
app.get ('/api/status',      api.getStatus);
app.get ('/api/jobs',        api.listJobs);  
app.post('/api/jobs',        api.startJob);
app.post('/api/tracers',     api.addTracer);
app.get ('/api/tracers',     api.listTracers);
app.post('/api/tasks/:id',   api.taskComplete);
app.get ('/', function(req, res) {
  res.redirect('/ui');
});

app.use('/ui', express.static(webUIDir, { etag: false, maxAge: 0 }));
app.use('/jobs', express.static(jobOutDir));

// Start server
let port = process.env.PORT || 9000;
let checkInterval = process.env.HEALTH_CHECK_INTERVAL || "5";
const server = app.listen(port, function () {
  console.log(`### Controller server listening on ${port}`);
  console.log(`### Web UI serving static content from: ${webUIDir}`);
  console.log(`### Web UI URL: http://localhost:${port}/ui`);
  
  console.log(`### Tracer health checks run every ${checkInterval} seconds`);
  setInterval(api.tracerHealthCheck, parseInt(checkInterval) * 1000);
});
