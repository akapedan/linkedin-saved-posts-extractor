// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
if (message.action === "savePosts") {
  console.log("Background script received savePosts message");
  console.log("Saving posts:", message.data);
  
  try {
    // Convert data to JSON string
    const jsonData = JSON.stringify(message.data, null, 2);
    
    // Create a downloadable data URL
    const dataUrl = `data:application/json;base64,${btoa(unescape(encodeURIComponent(jsonData)))}`;
    
    // Trigger the download
    chrome.downloads.download({
      url: dataUrl,
      filename: "linkedin_saved_posts.json",
      saveAs: false
    }, downloadId => {
      if (chrome.runtime.lastError) {
        console.error("Download error:", chrome.runtime.lastError);
      } else {
        console.log("Download started with ID:", downloadId);
      }
    });
    
    // Send response back to content script
    sendResponse({success: true, message: "Download initiated"});
  } catch (error) {
    console.error("Error processing download:", error);
    sendResponse({success: false, error: error.message});
  }
  
  // Return true to indicate we'll send a response asynchronously
  return true;
}
});

console.log("Background script loaded");