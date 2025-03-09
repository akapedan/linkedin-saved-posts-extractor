console.log("Content script loaded");

// Start the timer
const startTime = performance.now();

// Store post data (link, author, content)
const postData = [];
let previousContainerCount = 0; // Cache the last container count for optimization

// Function to extract post information from visible posts
function extractPosts(testMode = false) {
  const containers = document.querySelectorAll("div.entity-result__content-container");
  console.log(`Found ${containers.length} visible containers.`);

  // In test mode, only process the first container
  const containersToProcess = testMode ? [containers[0]] : containers;
  
  containersToProcess.forEach(container => {
    try {
      // First find the link for the post
      const linkElement = container.querySelector("a[data-test-app-aware-link]");
      if (!linkElement) return;
      
      const link = linkElement.href;
      
      // Check if we already have this link
      const existingPostIndex = postData.findIndex(post => post.link === link);
      if (existingPostIndex !== -1) return;
      
      // Extract author information using only the second approach which works consistently
      let author = "";
      
      // Look for aria-hidden spans in the container (not just in the link)
      const hiddenSpans = container.querySelectorAll('span[aria-hidden="true"]');
      for (const span of hiddenSpans) {
        const spanText = span.innerText.trim();
        if (spanText && spanText !== "...see more" && !spanText.includes("machine") && !link.includes(spanText)) {
          author = spanText;
          console.log("Author from hidden span:", author);
          break;
        }
      }
      
      // Extract post content - preserve the HTML initially to handle <br> tags
      let content = "";
      const contentElement = container.querySelector("p[class*='entity-result--no-ellipsis']");
      if (contentElement) {
        // Get the innerHTML to preserve <br> tags
        const contentHtml = contentElement.innerHTML;
        
        // Create a temporary div to handle the HTML content
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = contentHtml;
        
        // Replace <br><br> with a special marker
        const html = tempDiv.innerHTML.replace(/<br><br>/g, "###PARAGRAPH###");
        
        // Replace individual <br> with a different marker
        const html2 = html.replace(/<br>/g, "###LINEBREAK###");
        
        // Set the modified HTML back to get the text content
        tempDiv.innerHTML = html2;
        
        // Get the text content with our markers
        content = tempDiv.textContent;
        
        // Replace markers with proper spacing
        content = content.replace(/###PARAGRAPH###/g, ". ");
        content = content.replace(/###LINEBREAK###/g, ". ");
      }
      
      // Clean up the content text
      content = cleanupContent(content);
      
      // Add the post data
      postData.push({ 
        link: link,
        author: author,
        content: content
      });
      
      console.log(`New post added. Author: ${author}. Total posts: ${postData.length}`);
    } catch (e) {
      console.error("Error processing container:", e);
    }
  });

  console.log(`Total unique posts so far: ${postData.length}`);
  
  // If in test mode, finish after processing one post
  if (testMode && postData.length > 0) {
    finishExtraction();
  }
}

// Function to clean up the content text
function cleanupContent(text) {
  if (!text) return "";
  
  // Remove the "…see more" at the end
  let cleaned = text.replace(/…see more$/g, "").trim();
  
  // Add space after periods that don't have a space
  cleaned = cleaned.replace(/\.([A-Z𝗖𝗿𝗮𝘄𝗹𝟰𝗔𝗜])/g, ". $1");
  
  // Clean up any double spaces or double periods
  cleaned = cleaned.replace(/\s{2,}/g, " ");
  cleaned = cleaned.replace(/\.{2,}/g, ".");
  
  // Clean up any period-space-period patterns
  cleaned = cleaned.replace(/\. \./g, ".");
  
  return cleaned.trim();
}

// Function to click "Show More Results" button dynamically
async function clickShowMoreButtons(delay = 2000, testMode = false) {
  // In test mode, don't click any "Show More" buttons
  if (testMode) {
    return;
  }
  
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

    // Extract posts from newly loaded content
    extractPosts(testMode);

    // Short delay before next click
    await new Promise(resolve => setTimeout(resolve, delay));
  }
}

// Function to finish extraction and send data
function finishExtraction() {
  if (postData.length === 0) {
    console.log("No posts found to extract.");
    return;
  }

  // Send the post data to background script
  console.log("Sending data to background script:", postData);
  try {
    chrome.runtime.sendMessage({
      action: "savePosts",
      data: postData
    }, response => {
      console.log("Message response:", response);
    });
  } catch (error) {
    console.error("Error sending message:", error);
  }

  // Stop the timer
  const endTime = performance.now();
  console.log(`Total time taken: ${(endTime - startTime) / 1000} seconds`);
  console.log(`Total unique posts extracted: ${postData.length}`);
  console.log("Extraction complete. Data sent to background script.");
}

// Main function to load all posts and extract information
async function loadAndExtractAllPosts(testMode = false) {
  console.log(`Starting to load posts... ${testMode ? '(TEST MODE - only one post)' : ''}`);

  // Extract initially visible posts
  extractPosts(testMode);
  
  // If in test mode and we already have posts, we're done
  if (testMode && postData.length > 0) {
    return; // finishExtraction is already called in extractPosts for test mode
  }

  // Click "Show More Results" buttons to load all posts
  await clickShowMoreButtons(1000, testMode);

  console.log("Finished loading all posts. Starting final extraction...");

  // Final extraction in case there's still content left
  extractPosts(testMode);

  // Finish the extraction process
  finishExtraction();
}

// Check for test mode
const testMode = window.testMode || false;

// Start the process
loadAndExtractAllPosts(testMode);
