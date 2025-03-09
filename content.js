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
      // First find the author profile link
      const authorProfileElement = container.querySelector("a[data-test-app-aware-link]");
      if (!authorProfileElement) return;
      
      const authorProfileUrl = authorProfileElement.href;
      
      // Check if we already have this profile link
      const existingPostIndex = postData.findIndex(post => post.authorProfileUrl === authorProfileUrl);
      if (existingPostIndex !== -1) return;
      
      // Extract the post URL - check in multiple possible locations
      let postUrl = "";
      
      // First attempt: Look for the embedded object link (original approach)
      const postLinkElement = container.querySelector("a.entity-result__content-embedded-object");
      if (postLinkElement) {
        postUrl = postLinkElement.href;
      }
      
      // Second attempt: Look for the alternative link format with image inside
      if (!postUrl) {
        const altPostLinkElement = container.querySelector("a.CkxUBVZenYcRwKJEjEVtZebhlSfMWr:not([class*='entity-result__content-embedded-object'])");
        if (altPostLinkElement && altPostLinkElement.querySelector(".ivm-image-view-model")) {
          postUrl = altPostLinkElement.href;
        }
      }
      
      // Extract author information using only the second approach which works consistently
      let author = "";
      
      // Look for aria-hidden spans in the container (not just in the link)
      const hiddenSpans = container.querySelectorAll('span[aria-hidden="true"]');
      for (const span of hiddenSpans) {
        const spanText = span.innerText.trim();
        if (spanText && spanText !== "...see more" && !spanText.includes("machine") && !authorProfileUrl.includes(spanText)) {
          author = spanText;
          console.log("Author from hidden span:", author);
          break;
        }
      }
      
      // Extract author profile image URLs
      let authorImageUrl = "";
      
      // Look for profile image within the post container
      const profileImageElement = container.querySelector("img.entity-result__embedded-object-image, img.ivm-view-attr__img--centered");
      if (profileImageElement && profileImageElement.src) {
        authorImageUrl = profileImageElement.src;
        console.log("Found author image URL:", authorImageUrl);
      }
      
      // Extract post-related image (if available)
      let postImageUrl = "";
      
      // Look for post images with the specific structure provided
      const postImageContainer = container.querySelector("div.ivm-image-view-model.relative");
      if (postImageContainer) {
        const postImageElement = postImageContainer.querySelector("img.ivm-view-attr__img--centered");
        if (postImageElement && postImageElement.src) {
          postImageUrl = postImageElement.src;
          console.log("Found post image URL:", postImageUrl);
        }
      }
      
      // Extract post content - preserve the HTML initially to handle <br> tags
      let content = "";
      let title = "";
      let rawContent = "";
      const contentElement = container.querySelector("p[class*='entity-result--no-ellipsis']");
      if (contentElement) {
        // Get the innerHTML to preserve <br> tags
        const contentHtml = contentElement.innerHTML;
        
        // Create a temporary div to handle the HTML content
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = contentHtml;
        
        // Extract the title - get the text before the first <br> tag
        const htmlContent = contentElement.innerHTML;
        const brIndex = htmlContent.indexOf('<br>');
        
        if (brIndex !== -1) {
          // Create a temporary element to extract text content before the first <br>
          const titleTempDiv = document.createElement('div');
          titleTempDiv.innerHTML = htmlContent.substring(0, brIndex);
          title = titleTempDiv.textContent.trim();
          
          // Create content without the title part
          const contentTempDiv = document.createElement('div');
          contentTempDiv.innerHTML = htmlContent.substring(brIndex);
          rawContent = contentTempDiv.innerHTML;
        } else {
          rawContent = contentHtml;
        }
        
        // Process the content (without title if we extracted it)
        const contentTempDiv = document.createElement('div');
        contentTempDiv.innerHTML = rawContent;
        
        // Replace <br><br> with a special marker
        const html = contentTempDiv.innerHTML.replace(/<br><br>/g, "###PARAGRAPH###");
        
        // Replace individual <br> with a different marker
        const html2 = html.replace(/<br>/g, "###LINEBREAK###");
        
        // Set the modified HTML back to get the text content
        contentTempDiv.innerHTML = html2;
        
        // Get the text content with our markers
        content = contentTempDiv.textContent;
        
        // Replace markers with proper spacing
        content = content.replace(/###PARAGRAPH###/g, ". ");
        content = content.replace(/###LINEBREAK###/g, ". ");
        
        // Clean up the content text
        content = cleanupContent(content);
        
        // If the content starts with periods or whitespace (which can happen after <br> extraction),
        // remove them regardless of which extraction method was used
        content = content.replace(/^[\s\.]+/, "");
        
        // If title wasn't extracted from HTML structure, extract from first sentence of full content
        if (!title) {
          // Get the full content first
          const fullContent = cleanupContent(tempDiv.textContent);
          
          // Find the first sentence
          const sentenceEnd = fullContent.search(/[.!?](\s|$)/);
          
          if (sentenceEnd !== -1) {
            // We found a proper sentence ending
            title = fullContent.substring(0, sentenceEnd + 1).trim();
            
            // Remove the title from the content
            if (content.startsWith(title)) {
              content = content.substring(title.length).trim();
              
              // Remove any leading periods and spaces again after title extraction
              content = content.replace(/^[\s\.]+/, "");
            }
          } else {
            // No proper sentence ending found
            // Check if content is short enough to just use as title
            if (fullContent.split(' ').length <= 15) {
              title = fullContent;
              content = ""; // No content if title is the entire text
            } else {
              // Use first 10 words as title, but without adding "..."
              title = fullContent.split(' ').slice(0, 10).join(' ');
              
              // Make sure title ends with proper punctuation
              if (!title.match(/[.!?]$/)) {
                title += ".";
              }
              
              // Remove the title portion from content
              if (content.startsWith(title)) {
                content = content.substring(title.length).trim();
                content = content.replace(/^[\s\.]+/, "");
              }
            }
          }
        }
        
        // Final check to prevent duplicate content
        if (content && title && content.trim() === title.trim()) {
          // If content and title are identical, clear the content
          content = "";
        }
        
        // Another check to prevent near-duplicate content
        if (content && title && title.endsWith("...") && content.startsWith(title.substring(0, title.length - 3))) {
          // If title ends with "..." and content starts with the title (minus the "..."), adjust the content
          content = content.substring(title.length - 3).trim();
          content = content.replace(/^[\s\.]+/, "");
        }
      }
      
      // Add the post data with renamed key and new postUrl field
      postData.push({ 
        authorProfileUrl: authorProfileUrl, // Renamed from 'link' to be more descriptive
        postUrl: postUrl,                   // New field for the actual post URL
        author: author,
        content: content,
        title: title,
        authorImageUrl: authorImageUrl,
        postImageUrl: postImageUrl
      });
      
      console.log(`New post added. Author: ${author}. Title: ${title.substring(0, 30)}... Author Image: ${authorImageUrl ? "Yes" : "No"}. Post Image: ${postImageUrl ? "Yes" : "No"}. Total posts: ${postData.length}`);
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
function cleanupContent(text, isContentAfterTitle = false) {
  if (!text) return "";
  
  // Remove the "…see more" and "...see more" at the end and anywhere in the text
  let cleaned = text.replace(/…see more/g, "").trim();
  cleaned = cleaned.replace(/\.\.\.see more/g, "").trim();
  
  // Add space after periods that don't have a space (only if not content after title)
  if (!isContentAfterTitle) {
    cleaned = cleaned.replace(/\.([A-Z𝗖𝗿𝗮𝘄𝗹𝟰𝗔𝗜])/g, ". $1");
  }
  
  // Clean up any double spaces or double periods
  cleaned = cleaned.replace(/\s{2,}/g, " ");
  cleaned = cleaned.replace(/\.{2,}/g, ".");
  
  // Clean up any period-space-period patterns
  cleaned = cleaned.replace(/\. \./g, ".");
  
  // If this is content after the title has been removed, clean up any leading periods
  if (isContentAfterTitle) {
    cleaned = cleaned.replace(/^\.+\s*/, "");
  }
  
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
