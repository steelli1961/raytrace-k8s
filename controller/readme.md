# RayScale Controller

## Configuration
All configuration is done via environmental variables. When running locally dotenv (`.env`) files are the simplest way to modify the configuration, a sample `.env.sample` file is provided which can be renamed. When running as a container provide you must the env variables using what ever interface the container runtime provides (command line, YAML, ARM template etc)

|Name|Default|Notes|
|---|---|---|
|**PORT**|9000|The port the server listens on|
|**HEALTH_CHECK_INTERVAL**|5|How often to 'ping' tracers to check they are healthy and online|
|**DIR_JOBOUT**|./dist/../jobs|Where to store jobs, folder will be created if it doesn't exist. The default will be folder above the dist folder with compiled JS|


## Controller API

|Route|Method|Calls|Notes|
|---|---|---|---|
|/api/status|GET|getStatus()|Provide current status of the controller, active job, tracers online etc|
|/api/jobs|GET|listJob()|Lists completed and active jobs, by examining the jobs output folder|
|/api/jobs|POST|startJob()|Start a new job, POST body must contain a YAML job definition, and have content-type of `application/x-yaml`|
|/api/tracers|POST|addTracer()|When a tracer is started, it registers with the controller using this|
|/api/tracers|GET|listTracers()|List which tracers are online|
|/api/tasks/{taskId}|POST|taskComplete()|Completion of a task, normally binary image data|


## Data Structures

### Job Input
```typescript
name:   string;     // Job name, no spaces
width:  number;     // Output image width
height: number;     // Output image height
scene:  Scene;      // Scene to be rendered  
```