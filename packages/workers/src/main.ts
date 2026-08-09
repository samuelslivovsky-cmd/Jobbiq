import { startCrawlWorker } from "./crawlWorker";

const worker = startCrawlWorker();

worker.on("completed", (job, result) => {
  console.log(`[crawl] job ${job.id} done:`, result);
});
worker.on("failed", (job, err) => {
  console.error(`[crawl] job ${job?.id} failed:`, err.message);
});

console.log("Jobbiq workers running (queues: crawl)");
