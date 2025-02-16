console.log("Content script loaded");

// Start the timer
const startTime = performance.now();

// A Set to store unique post links
const uniqueLinks = new Set();
let previousContainerCount = 0; // Cache the last container count for optimization

// Function to extract links from visible posts
function extractLinks() {
  const containers = document.querySelectorAll("div.entity-result__content-inner-container--right-padding");
  console.log(`Found ${containers.length} visible containers.`);

  containers.forEach(container => {
    const linkElement = container.querySelector("a[data-test-app-aware-link]");
    if (linkElement) {
      const link = linkElement.href;

      // Add only if the link is new
      if (!uniqueLinks.has(link)) {
        uniqueLinks.add(link); // Add to the Set
        console.log(`New link added. Total links: ${uniqueLinks.size}`);
      }
    }
  });

  console.log(`Total unique links so far: ${uniqueLinks.size}`);
}

// Function to click "Show More Results" button dynamically
async function clickShowMoreButtons(delay = 2000) {
  while (true) {
    const showMoreButton = document.querySelector('button.scaffold-finite-scroll__load-button');

    if (!showMoreButton) {
      console.log("No more 'Show More Results' buttons found.");
      break;
    }

    console.log("Clicking 'Show More Results' button...");
    showMoreButton.click();

    // Wait for new content to load
    const contentLoaded = await new Promise(resolve => {
      const interval = setInterval(() => {
        const currentContainerCount = document.querySelectorAll("div.entity-result__content-inner-container--right-padding").length;

        if (currentContainerCount > previousContainerCount) {
          previousContainerCount = currentContainerCount; // Update cache
          clearInterval(interval);
          resolve(true);
        }
      }, 500);

      // Timeout to avoid getting stuck
      setTimeout(() => {
        clearInterval(interval);
        resolve(false);
      }, 10000); // 10-second timeout
    });

    if (!contentLoaded) {
      console.log("No new content detected after timeout. Stopping.");
      break;
    }

    // Extract links from newly loaded content
    extractLinks();

    // Short delay before next click
    await new Promise(resolve => setTimeout(resolve, delay));
  }
}

// Main function to load all posts and extract links
async function loadAndExtractAllPosts() {
  console.log("Starting to load all posts...");

  // Click "Show More Results" buttons to load all posts
  await clickShowMoreButtons(1000); // Dynamically continues until no buttons are found

  console.log("Finished loading all posts. Starting final extraction...");

  // Final extraction in case there's still content left
  extractLinks();

  // Convert Set to Array and send to background script
  const linksArray = Array.from(uniqueLinks).map(link => ({ link }));
  chrome.runtime.sendMessage({ action: "savePosts", data: linksArray });

  // Stop the timer
  const endTime = performance.now();
  console.log(`Total time taken: ${(endTime - startTime) / 1000} seconds`);
  console.log(`Total unique links extracted: ${uniqueLinks.size}`);
  console.log("Extraction complete. Data sent to background script.");
}

// Start the process
loadAndExtractAllPosts();
