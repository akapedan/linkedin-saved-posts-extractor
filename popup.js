document.getElementById("extract-btn").addEventListener("click", () => {
    console.log("Extract button clicked"); // Log when button is clicked
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      console.log("Tabs:", tabs); // Log the active tab details
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        files: ["content.js"]
      });
    });
  });
  