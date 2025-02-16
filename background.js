chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "savePosts") {
      console.log("Saving posts:", message.data);
  
      // Convert data to JSON string
      const jsonData = JSON.stringify(message.data, null, 2);
  
      // Create a downloadable data URL
      const dataUrl = `data:application/json;base64,${btoa(jsonData)}`;
  
      // Trigger the download
      chrome.downloads.download({
        url: dataUrl,
        filename: "linkedin_saved_posts.json"
      });
    }
  });
  