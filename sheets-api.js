// Section 1: Authentication and Core Sheet Creation

// Handle interactions with Google Sheets API

// Create a new account plan spreadsheet with a single sheet
function createAccountPlanSheet(companyName) {
  console.log('Starting to create account plan for:', companyName);
  
  return getAuthToken()
    .then(token => {
      console.log('Auth token obtained, length:', token ? token.length : 0);
      
      // Step 1: Create a new spreadsheet with just one sheet
      return fetch('https://sheets.googleapis.com/v4/spreadsheets', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          properties: {
            title: `${companyName} - Account Plan`
          },
          sheets: [
            { properties: { title: 'Account Plan' } }
          ]
        })
      })
      .then(response => {
        console.log('API response status:', response.status);
        
        if (!response.ok) {
          return response.text().then(text => {
            console.error('Error response status:', response.status);
            console.error('Error response text:', text);
            
            try {
              const jsonError = JSON.parse(text);
              console.error('Error details:', jsonError);
              
              // More specific error message based on the API response
              if (jsonError.error && jsonError.error.message) {
                throw new Error(`API Error: ${jsonError.error.message}`);
              }
            } catch (e) {
              // Not JSON or JSON parsing failed
              console.error('JSON parse error:', e);
            }
            
            // Fall back to generic error with status code
            throw new Error(`Failed to create spreadsheet (Status: ${response.status})`);
          });
        }
        return response.json();
      });
    })
    .then(spreadsheet => {
      console.log('Spreadsheet created successfully:', spreadsheet.spreadsheetId);
      const spreadsheetId = spreadsheet.spreadsheetId;
      
      // IMPORTANT FIX: Create the URL properly
      const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
      
      // Store the spreadsheet ID and URL in chrome.storage.local
      return new Promise((resolve, reject) => {
        chrome.storage.local.get(['accountPlans'], function(result) {
          const accountPlans = result.accountPlans || {};
          accountPlans[companyName] = {
            id: spreadsheetId,
            url: spreadsheetUrl,
            created: new Date().toISOString()
          };
          
          chrome.storage.local.set({accountPlans: accountPlans}, function() {
            if (chrome.runtime.lastError) {
              console.error('Error saving account plan:', chrome.runtime.lastError);
              reject(new Error('Failed to save account plan information'));
              return;
            }
            
            // Populate the template and then return the full spreadsheet object
            populateTemplate(spreadsheetId, companyName)
              .then(() => {
                // Return both spreadsheet and URL for easier access
                resolve({
                  ...spreadsheet,
                  url: spreadsheetUrl
                });
              })
              .catch(error => {
                console.error('Template population error:', error);
                // Still resolve with the basic spreadsheet info even if template fails
                resolve({
                  ...spreadsheet,
                  url: spreadsheetUrl
                });
              });
          });
        });
      });
    })
    .catch(error => {
      console.error('Caught error in createAccountPlanSheet:', error);
      
      // Check if it's an authentication error
      if (error.message && (error.message.includes('token') || error.message.includes('auth') || 
          error.message.includes('UNAUTHENTICATED'))) {
        // Attempt to refresh the token and try again
        return refreshAuthToken()
          .then(newToken => {
            console.log('Token refreshed, retrying...');
            // Retry the operation now that we have a fresh token
            return createAccountPlanSheet(companyName);
          })
          .catch(refreshError => {
            console.error('Token refresh failed:', refreshError);
            throw new Error('Authentication failed. Please sign in again.');
          });
      }
      
      // Re-throw the original error
      throw error;
    });
}

// Section 2: Template Population Functions

// Populate the sheet with a comprehensive template
function populateTemplate(spreadsheetId, companyName) {
  return getAuthToken()
    .then(token => {
      // First, get the sheets in the spreadsheet to find the correct sheetId
      return fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })
      .then(response => {
        if (!response.ok) {
          return response.text().then(text => {
            console.error('Error response (get spreadsheet):', text);
            try {
              const jsonError = JSON.parse(text);
              console.error('Error details:', jsonError);
            } catch (e) {
              // Not JSON
            }
            throw new Error('Failed to get spreadsheet info');
          });
        }
        return response.json();
      })
      .then(data => {
        // Find the sheet and get its ID
        console.log('Sheet properties:', data);
        
        if (!data.sheets || data.sheets.length === 0) {
          throw new Error('No sheets found in the spreadsheet');
        }
        
        const sheet = data.sheets[0]; // Use the first sheet
        
        if (!sheet.properties || sheet.properties.sheetId === undefined) {
          console.error('Sheet structure:', sheet);
          throw new Error('Sheet ID not found in response');
        }
        
        // Rename the first sheet to "Account Plan" if it's not already named that
        let renameSheetRequest = null;
        if (sheet.properties.title !== 'Account Plan') {
          renameSheetRequest = {
            updateSheetProperties: {
              properties: {
                sheetId: sheet.properties.sheetId,
                title: 'Account Plan'
              },
              fields: 'title'
            }
          };
        }
        
        const sheetId = sheet.properties.sheetId;
        console.log('Using sheet ID:', sheetId);
        
        // If we need to rename the sheet, do that first
        if (renameSheetRequest) {
          return fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ requests: [renameSheetRequest] })
          })
          .then(response => {
            if (!response.ok) {
              console.error('Error renaming sheet, continuing anyway');
            }
            return sheetId; // Continue with the sheet ID regardless
          });
        } else {
          return sheetId;
        }
      })
      .then(sheetId => {

        // Apply the template with all sections
        const requests = [
          // 1. Set column widths for better readability
          {
            updateDimensionProperties: {
              range: {
                sheetId: sheetId,
                dimension: "COLUMNS",
                startIndex: 0,
                endIndex: 7
              },
              properties: {
                pixelSize: 150
              },
              fields: "pixelSize"
            }
          },
          // 2. Apply initial grid data with merged cells for headers
          {
            updateCells: {
              range: {
                sheetId: sheetId,
                startRowIndex: 0,
                endRowIndex: 100,
                startColumnIndex: 0,
                endColumnIndex: 7
              },
              rows: generateGridData(companyName),
              fields: "userEnteredValue,userEnteredFormat"
            }
          },
          // 3. Merge cells for section headers
          // Main Title
          {
            mergeCells: {
              range: {
                sheetId: sheetId,
                startRowIndex: 0,
                endRowIndex: 1,
                startColumnIndex: 0,
                endColumnIndex: 7
              },
              mergeType: "MERGE_ALL"
            }
          },
          // ACCOUNT OVERVIEW SECTION
          {
            mergeCells: {
              range: {
                sheetId: sheetId,
                startRowIndex: 2,
                endRowIndex: 3,
                startColumnIndex: 0,
                endColumnIndex: 7
              },
              mergeType: "MERGE_ALL"
            }
          },
          // CONTACTS SECTION
          {
            mergeCells: {
              range: {
                sheetId: sheetId,
                startRowIndex: 15,
                endRowIndex: 16,
                startColumnIndex: 0,
                endColumnIndex: 7
              },
              mergeType: "MERGE_ALL"
            }
          },
          // NEWS & UPDATES SECTION
          {
            mergeCells: {
              range: {
                sheetId: sheetId,
                startRowIndex: 25,
                endRowIndex: 26,
                startColumnIndex: 0,
                endColumnIndex: 7
              },
              mergeType: "MERGE_ALL"
            }
          },
          // INSIGHTS SECTION
          {
            mergeCells: {
              range: {
                sheetId: sheetId,
                startRowIndex: 35,
                endRowIndex: 36,
                startColumnIndex: 0,
                endColumnIndex: 7
              },
              mergeType: "MERGE_ALL"
            }
          }
        ];

        // Add the border and formatting requests
        const formattingRequests = generateFormattingRequests(sheetId);
        requests.push(...formattingRequests);

        // Apply all formatting
        return fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ requests })
        });
      });
    })
    .then(response => {
      if (!response.ok) {
        return response.text().then(text => {
          console.error('Error response:', text);
          try {
            const jsonError = JSON.parse(text);
            console.error('Error details:', jsonError);
          } catch (e) {
            // Not JSON
          }
          throw new Error('Failed to populate template');
        });
      }
      return response.json();
    });
}

// Generate formatting requests for borders and styling
function generateFormattingRequests(sheetId) {
  return [
    // 4. Add borders to tables
    // Contacts table borders
    {
      updateBorders: {
        range: {
          sheetId: sheetId,
          startRowIndex: 16,
          endRowIndex: 19,
          startColumnIndex: 0,
          endColumnIndex: 7
        },
        top: {
          style: "SOLID",
          width: 1,
          color: { red: 0.5, green: 0.5, blue: 0.5 }
        },
        bottom: {
          style: "SOLID",
          width: 1,
          color: { red: 0.5, green: 0.5, blue: 0.5 }
        },
        left: {
          style: "SOLID",
          width: 1,
          color: { red: 0.5, green: 0.5, blue: 0.5 }
        },
        right: {
          style: "SOLID",
          width: 1,
          color: { red: 0.5, green: 0.5, blue: 0.5 }
        },
        innerHorizontal: {
          style: "SOLID",
          width: 1,
          color: { red: 0.5, green: 0.5, blue: 0.5 }
        },
        innerVertical: {
          style: "SOLID",
          width: 1,
          color: { red: 0.5, green: 0.5, blue: 0.5 }
        }
      }
    },
    // News table borders
    {
      updateBorders: {
        range: {
          sheetId: sheetId,
          startRowIndex: 26,
          endRowIndex: 29,
          startColumnIndex: 0,
          endColumnIndex: 7
        },
        top: {
          style: "SOLID",
          width: 1,
          color: { red: 0.5, green: 0.5, blue: 0.5 }
        },
        bottom: {
          style: "SOLID",
          width: 1,
          color: { red: 0.5, green: 0.5, blue: 0.5 }
        },
        left: {
          style: "SOLID",
          width: 1,
          color: { red: 0.5, green: 0.5, blue: 0.5 }
        },
        right: {
          style: "SOLID",
          width: 1,
          color: { red: 0.5, green: 0.5, blue: 0.5 }
        },
        innerHorizontal: {
          style: "SOLID",
          width: 1,
          color: { red: 0.5, green: 0.5, blue: 0.5 }
        },
        innerVertical: {
          style: "SOLID",
          width: 1,
          color: { red: 0.5, green: 0.5, blue: 0.5 }
        }
      }
    },
    // Insights table borders
    {
      updateBorders: {
        range: {
          sheetId: sheetId,
          startRowIndex: 36,
          endRowIndex: 39,
          startColumnIndex: 0,
          endColumnIndex: 7
        },
        top: {
          style: "SOLID",
          width: 1,
          color: { red: 0.5, green: 0.5, blue: 0.5 }
        },
        bottom: {
          style: "SOLID",
          width: 1,
          color: { red: 0.5, green: 0.5, blue: 0.5 }
        },
        left: {
          style: "SOLID",
          width: 1,
          color: { red: 0.5, green: 0.5, blue: 0.5 }
        },
        right: {
          style: "SOLID",
          width: 1,
          color: { red: 0.5, green: 0.5, blue: 0.5 }
        },
        innerHorizontal: {
          style: "SOLID",
          width: 1,
          color: { red: 0.5, green: 0.5, blue: 0.5 }
        },
        innerVertical: {
          style: "SOLID",
          width: 1,
          color: { red: 0.5, green: 0.5, blue: 0.5 }
        }
      }
    },
    // 5. Freeze the header rows
    {
      updateSheetProperties: {
        properties: {
          sheetId: sheetId,
          gridProperties: {
            frozenRowCount: 1
          }
        },
        fields: "gridProperties.frozenRowCount"
      }
    },
    // 6. Set some row heights
    {
      updateDimensionProperties: {
        range: {
          sheetId: sheetId,
          dimension: "ROWS",
          startIndex: 0,
          endIndex: 1
        },
        properties: {
          pixelSize: 40
        },
        fields: "pixelSize"
      }
    },
    // Set section header row heights
    {
      updateDimensionProperties: {
        range: {
          sheetId: sheetId,
          dimension: "ROWS",
          startIndex: 2,
          endIndex: 3
        },
        properties: {
          pixelSize: 30
        },
        fields: "pixelSize"
      }
    },
    {
      updateDimensionProperties: {
        range: {
          sheetId: sheetId,
          dimension: "ROWS",
          startIndex: 15,
          endIndex: 16
        },
        properties: {
          pixelSize: 30
        },
        fields: "pixelSize"
      }
    },
    {
      updateDimensionProperties: {
        range: {
          sheetId: sheetId,
          dimension: "ROWS",
          startIndex: 25,
          endIndex: 26
        },
        properties: {
          pixelSize: 30
        },
        fields: "pixelSize"
      }
    },
    {
      updateDimensionProperties: {
        range: {
          sheetId: sheetId,
          dimension: "ROWS",
          startIndex: 35,
          endIndex: 36
        },
        properties: {
          pixelSize: 30
        },
        fields: "pixelSize"
      }
    }
  ];
}
// Generate all the cell data for the account plan
function generateGridData(companyName) {
  const rows = [];
  
  // Title Row
  rows.push({
    values: [
      {
        userEnteredValue: { stringValue: `ACCOUNT PLAN: ${companyName}` },
        userEnteredFormat: {
          textFormat: { bold: true, fontSize: 16 },
          backgroundColor: { red: 0.23, green: 0.57, blue: 0.78 },
          horizontalAlignment: 'CENTER',
          verticalAlignment: 'MIDDLE',
          textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 } }
        }
      }
    ].concat(Array(6).fill({
      userEnteredFormat: {
        backgroundColor: { red: 0.23, green: 0.57, blue: 0.78 }
      }
    }))
  });
  
  // Empty spacing row
  rows.push(emptyRow());
  
  // ACCOUNT OVERVIEW SECTION
  // Section Header
  rows.push({
    values: [
      {
        userEnteredValue: { stringValue: "ACCOUNT OVERVIEW" },
        userEnteredFormat: {
          textFormat: { bold: true, fontSize: 12 },
          backgroundColor: { red: 0.93, green: 0.93, blue: 0.93 },
          horizontalAlignment: 'CENTER',
          verticalAlignment: 'MIDDLE'
        }
      }
    ].concat(Array(6).fill({
      userEnteredFormat: {
        backgroundColor: { red: 0.93, green: 0.93, blue: 0.93 }
      }
    }))
  });
  
  // Account Overview Fields
  const overviewFields = [
    { key: "Company Website", value: "" },
    { key: "Industry", value: "" },
    { key: "Revenue", value: "" },
    { key: "Employee Count", value: "" },
    { key: "Headquarters", value: "" },
    { key: "Current Situation", value: "" },
    { key: "Pain Points", value: "" },
    { key: "Goals", value: "" },
    { key: "Current Solutions", value: "" },
    { key: "Decision Makers", value: "" },
    { key: "Budget Cycle", value: "" }
  ];
  
  overviewFields.forEach(field => {
    rows.push({
      values: [
        {
          userEnteredValue: { stringValue: field.key },
          userEnteredFormat: {
            textFormat: { bold: true },
            backgroundColor: { red: 0.97, green: 0.97, blue: 0.97 },
            borders: {
              top: { style: "SOLID" },
              bottom: { style: "SOLID" },
              left: { style: "SOLID" },
              right: { style: "SOLID" }
            }
          }
        },
        {
          userEnteredValue: { stringValue: field.value },
          userEnteredFormat: {
            wrapStrategy: "WRAP",
            borders: {
              top: { style: "SOLID" },
              bottom: { style: "SOLID" },
              left: { style: "SOLID" },
              right: { style: "SOLID" }
            }
          }
        }
      ].concat(Array(5).fill({
        userEnteredFormat: {
          borders: {
            top: { style: "SOLID" },
            bottom: { style: "SOLID" },
            left: { style: "SOLID" },
            right: { style: "SOLID" }
          }
        }
      }))
    });
  });
  
  // Empty spacing row
  rows.push(emptyRow());

  // CONTACTS SECTION
  // Section Header
  rows.push({
    values: [
      {
        userEnteredValue: { stringValue: "CONTACTS" },
        userEnteredFormat: {
          textFormat: { bold: true, fontSize: 12 },
          backgroundColor: { red: 0.93, green: 0.93, blue: 0.93 },
          horizontalAlignment: 'CENTER',
          verticalAlignment: 'MIDDLE'
        }
      }
    ].concat(Array(6).fill({
      userEnteredFormat: {
        backgroundColor: { red: 0.93, green: 0.93, blue: 0.93 }
      }
    }))
  });
  
  // Contacts header row
  rows.push({
    values: [
      {
        userEnteredValue: { stringValue: "Name" },
        userEnteredFormat: { 
          textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
          backgroundColor: { red: 0.23, green: 0.57, blue: 0.78 },
          horizontalAlignment: 'CENTER',
          verticalAlignment: 'MIDDLE'
        }
      },
      {
        userEnteredValue: { stringValue: "Title" },
        userEnteredFormat: { 
          textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
          backgroundColor: { red: 0.23, green: 0.57, blue: 0.78 },
          horizontalAlignment: 'CENTER',
          verticalAlignment: 'MIDDLE'
        }
      },
      {
        userEnteredValue: { stringValue: "Email" },
        userEnteredFormat: { 
          textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
          backgroundColor: { red: 0.23, green: 0.57, blue: 0.78 },
          horizontalAlignment: 'CENTER',
          verticalAlignment: 'MIDDLE'
        }
      },
      {
        userEnteredValue: { stringValue: "Phone" },
        userEnteredFormat: { 
          textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
          backgroundColor: { red: 0.23, green: 0.57, blue: 0.78 },
          horizontalAlignment: 'CENTER',
          verticalAlignment: 'MIDDLE'
        }
      },
      {
        userEnteredValue: { stringValue: "LinkedIn" },
        userEnteredFormat: { 
          textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
          backgroundColor: { red: 0.23, green: 0.57, blue: 0.78 },
          horizontalAlignment: 'CENTER',
          verticalAlignment: 'MIDDLE'
        }
      },
      {
        userEnteredValue: { stringValue: "Notes" },
        userEnteredFormat: { 
          textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
          backgroundColor: { red: 0.23, green: 0.57, blue: 0.78 },
          horizontalAlignment: 'CENTER',
          verticalAlignment: 'MIDDLE'
        }
      },
      {
        userEnteredValue: { stringValue: "Last Contact" },
        userEnteredFormat: { 
          textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
          backgroundColor: { red: 0.23, green: 0.57, blue: 0.78 },
          horizontalAlignment: 'CENTER',
          verticalAlignment: 'MIDDLE'
        }
      }
    ]
  });
  
  // Empty contacts rows
  rows.push({
    values: Array(7).fill({
      userEnteredValue: { stringValue: "" },
      userEnteredFormat: {
        wrapStrategy: "WRAP",
        horizontalAlignment: 'LEFT',
        verticalAlignment: 'MIDDLE'
      }
    })
  });
  
  rows.push({
    values: Array(7).fill({
      userEnteredValue: { stringValue: "" },
      userEnteredFormat: {
        wrapStrategy: "WRAP",
        horizontalAlignment: 'LEFT',
        verticalAlignment: 'MIDDLE'
      }
    })
  });
  
  // Empty spacing row
  rows.push(emptyRow());

  // Add News & Updates and Insights sections
  rows.push(...generateNewsAndInsightsSections());
  
  return rows;
}

// Section 3: Grid Data Generation

// Generate all the cell data for the account plan
function generateGridData(companyName) {
  const rows = [];
  
  // Title Row
  rows.push({
    values: [
      {
        userEnteredValue: { stringValue: `ACCOUNT PLAN: ${companyName}` },
        userEnteredFormat: {
          textFormat: { bold: true, fontSize: 16 },
          backgroundColor: { red: 0.23, green: 0.57, blue: 0.78 },
          horizontalAlignment: 'CENTER',
          verticalAlignment: 'MIDDLE',
          textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 } }
        }
      }
    ].concat(Array(6).fill({
      userEnteredFormat: {
        backgroundColor: { red: 0.23, green: 0.57, blue: 0.78 }
      }
    }))
  });
  
  // Empty spacing row
  rows.push(emptyRow());
  
  // ACCOUNT OVERVIEW SECTION
  // Section Header
  rows.push({
    values: [
      {
        userEnteredValue: { stringValue: "ACCOUNT OVERVIEW" },
        userEnteredFormat: {
          textFormat: { bold: true, fontSize: 12 },
          backgroundColor: { red: 0.93, green: 0.93, blue: 0.93 },
          horizontalAlignment: 'CENTER',
          verticalAlignment: 'MIDDLE'
        }
      }
    ].concat(Array(6).fill({
      userEnteredFormat: {
        backgroundColor: { red: 0.93, green: 0.93, blue: 0.93 }
      }
    }))
  });
  
  // Account Overview Fields
  const overviewFields = [
    { key: "Company Website", value: "" },
    { key: "Industry", value: "" },
    { key: "Revenue", value: "" },
    { key: "Employee Count", value: "" },
    { key: "Headquarters", value: "" },
    { key: "Current Situation", value: "" },
    { key: "Pain Points", value: "" },
    { key: "Goals", value: "" },
    { key: "Current Solutions", value: "" },
    { key: "Decision Makers", value: "" },
    { key: "Budget Cycle", value: "" }
  ];
  
  overviewFields.forEach(field => {
    rows.push({
      values: [
        {
          userEnteredValue: { stringValue: field.key },
          userEnteredFormat: {
            textFormat: { bold: true },
            backgroundColor: { red: 0.97, green: 0.97, blue: 0.97 },
            borders: {
              top: { style: "SOLID" },
              bottom: { style: "SOLID" },
              left: { style: "SOLID" },
              right: { style: "SOLID" }
            }
          }
        },
        {
          userEnteredValue: { stringValue: field.value },
          userEnteredFormat: {
            wrapStrategy: "WRAP",
            borders: {
              top: { style: "SOLID" },
              bottom: { style: "SOLID" },
              left: { style: "SOLID" },
              right: { style: "SOLID" }
            }
          }
        }
      ].concat(Array(5).fill({
        userEnteredFormat: {
          borders: {
            top: { style: "SOLID" },
            bottom: { style: "SOLID" },
            left: { style: "SOLID" },
            right: { style: "SOLID" }
          }
        }
      }))
    });
  });
  
  // Empty spacing row
  rows.push(emptyRow());

  // CONTACTS SECTION
  // Section Header
  rows.push({
    values: [
      {
        userEnteredValue: { stringValue: "CONTACTS" },
        userEnteredFormat: {
          textFormat: { bold: true, fontSize: 12 },
          backgroundColor: { red: 0.93, green: 0.93, blue: 0.93 },
          horizontalAlignment: 'CENTER',
          verticalAlignment: 'MIDDLE'
        }
      }
    ].concat(Array(6).fill({
      userEnteredFormat: {
        backgroundColor: { red: 0.93, green: 0.93, blue: 0.93 }
      }
    }))
  });
  
  // Contacts header row
  rows.push({
    values: [
      {
        userEnteredValue: { stringValue: "Name" },
        userEnteredFormat: { 
          textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
          backgroundColor: { red: 0.23, green: 0.57, blue: 0.78 },
          horizontalAlignment: 'CENTER',
          verticalAlignment: 'MIDDLE'
        }
      },
      {
        userEnteredValue: { stringValue: "Title" },
        userEnteredFormat: { 
          textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
          backgroundColor: { red: 0.23, green: 0.57, blue: 0.78 },
          horizontalAlignment: 'CENTER',
          verticalAlignment: 'MIDDLE'
        }
      },
      {
        userEnteredValue: { stringValue: "Email" },
        userEnteredFormat: { 
          textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
          backgroundColor: { red: 0.23, green: 0.57, blue: 0.78 },
          horizontalAlignment: 'CENTER',
          verticalAlignment: 'MIDDLE'
        }
      },
      {
        userEnteredValue: { stringValue: "Phone" },
        userEnteredFormat: { 
          textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
          backgroundColor: { red: 0.23, green: 0.57, blue: 0.78 },
          horizontalAlignment: 'CENTER',
          verticalAlignment: 'MIDDLE'
        }
      },
      {
        userEnteredValue: { stringValue: "LinkedIn" },
        userEnteredFormat: { 
          textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
          backgroundColor: { red: 0.23, green: 0.57, blue: 0.78 },
          horizontalAlignment: 'CENTER',
          verticalAlignment: 'MIDDLE'
        }
      },
      {
        userEnteredValue: { stringValue: "Notes" },
        userEnteredFormat: { 
          textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
          backgroundColor: { red: 0.23, green: 0.57, blue: 0.78 },
          horizontalAlignment: 'CENTER',
          verticalAlignment: 'MIDDLE'
        }
      },
      {
        userEnteredValue: { stringValue: "Last Contact" },
        userEnteredFormat: { 
          textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
          backgroundColor: { red: 0.23, green: 0.57, blue: 0.78 },
          horizontalAlignment: 'CENTER',
          verticalAlignment: 'MIDDLE'
        }
      }
    ]
  });
  
  // Empty contacts rows
  rows.push({
    values: Array(7).fill({
      userEnteredValue: { stringValue: "" },
      userEnteredFormat: {
        wrapStrategy: "WRAP",
        horizontalAlignment: 'LEFT',
        verticalAlignment: 'MIDDLE'
      }
    })
  });
  
  rows.push({
    values: Array(7).fill({
      userEnteredValue: { stringValue: "" },
      userEnteredFormat: {
        wrapStrategy: "WRAP",
        horizontalAlignment: 'LEFT',
        verticalAlignment: 'MIDDLE'
      }
    })
  });
  
  // Empty spacing row
  rows.push(emptyRow());

  // Add News & Updates and Insights sections
  rows.push(...generateNewsAndInsightsSections());
  
  return rows;
}

// Generate the news and insights sections
function generateNewsAndInsightsSections() {
  const rows = [];
  
  // NEWS & UPDATES SECTION
  // Section Header
  rows.push({
    values: [
      {
        userEnteredValue: { stringValue: "NEWS & UPDATES" },
        userEnteredFormat: {
          textFormat: { bold: true, fontSize: 12 },
          backgroundColor: { red: 0.93, green: 0.93, blue: 0.93 },
          horizontalAlignment: 'CENTER',
          verticalAlignment: 'MIDDLE'
        }
      }
    ].concat(Array(6).fill({
      userEnteredFormat: {
        backgroundColor: { red: 0.93, green: 0.93, blue: 0.93 }
      }
    }))
  });
  
  // News header row
  rows.push({
    values: [
      {
        userEnteredValue: { stringValue: "Date" },
        userEnteredFormat: { 
          textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
          backgroundColor: { red: 0.23, green: 0.57, blue: 0.78 },
          horizontalAlignment: 'CENTER',
          verticalAlignment: 'MIDDLE'
        }
      },
      {
        userEnteredValue: { stringValue: "Title" },
        userEnteredFormat: { 
          textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
          backgroundColor: { red: 0.23, green: 0.57, blue: 0.78 },
          horizontalAlignment: 'CENTER',
          verticalAlignment: 'MIDDLE'
        }
      },
      {
        userEnteredValue: { stringValue: "Source" },
        userEnteredFormat: { 
          textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
          backgroundColor: { red: 0.23, green: 0.57, blue: 0.78 },
          horizontalAlignment: 'CENTER',
          verticalAlignment: 'MIDDLE'
        }
      },
      {
        userEnteredValue: { stringValue: "URL" },
        userEnteredFormat: { 
          textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
          backgroundColor: { red: 0.23, green: 0.57, blue: 0.78 },
          horizontalAlignment: 'CENTER',
          verticalAlignment: 'MIDDLE'
        }
      },
      {
        userEnteredValue: { stringValue: "Notes" },
        userEnteredFormat: { 
          textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
          backgroundColor: { red: 0.23, green: 0.57, blue: 0.78 },
          horizontalAlignment: 'CENTER',
          verticalAlignment: 'MIDDLE'
        }
      }
    ].concat(Array(2).fill({
      userEnteredFormat: {
        backgroundColor: { red: 0.23, green: 0.57, blue: 0.78 }
      }
    }))
  });
  
  // Empty news rows
  rows.push({
    values: Array(5).fill({
      userEnteredValue: { stringValue: "" },
      userEnteredFormat: {
        wrapStrategy: "WRAP",
        horizontalAlignment: 'LEFT',
        verticalAlignment: 'MIDDLE'
      }
    }).concat(Array(2).fill({}))
  });
  
  rows.push({
    values: Array(5).fill({
      userEnteredValue: { stringValue: "" },
      userEnteredFormat: {
        wrapStrategy: "WRAP",
        horizontalAlignment: 'LEFT',
        verticalAlignment: 'MIDDLE'
      }
    }).concat(Array(2).fill({}))
  });
  
  // Empty spacing row
  rows.push(emptyRow());
  
  // INSIGHTS SECTION
  // Section Header
  rows.push({
    values: [
      {
        userEnteredValue: { stringValue: "INSIGHTS & ACTION ITEMS" },
        userEnteredFormat: {
          textFormat: { bold: true, fontSize: 12 },
          backgroundColor: { red: 0.93, green: 0.93, blue: 0.93 },
          horizontalAlignment: 'CENTER',
          verticalAlignment: 'MIDDLE'
        }
      }
    ].concat(Array(6).fill({
      userEnteredFormat: {
        backgroundColor: { red: 0.93, green: 0.93, blue: 0.93 }
      }
    }))
  });
  
  // Insights header row
  rows.push({
    values: [
      {
        userEnteredValue: { stringValue: "Date" },
        userEnteredFormat: { 
          textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
          backgroundColor: { red: 0.23, green: 0.57, blue: 0.78 },
          horizontalAlignment: 'CENTER',
          verticalAlignment: 'MIDDLE'
        }
      },
      {
        userEnteredValue: { stringValue: "Insight" },
        userEnteredFormat: { 
          textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
          backgroundColor: { red: 0.23, green: 0.57, blue: 0.78 },
          horizontalAlignment: 'CENTER',
          verticalAlignment: 'MIDDLE'
        }
      },
      {
        userEnteredValue: { stringValue: "Source" },
        userEnteredFormat: { 
          textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
          backgroundColor: { red: 0.23, green: 0.57, blue: 0.78 },
          horizontalAlignment: 'CENTER',
          verticalAlignment: 'MIDDLE'
        }
      },
      {
        userEnteredValue: { stringValue: "Action Item" },
        userEnteredFormat: { 
          textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
          backgroundColor: { red: 0.23, green: 0.57, blue: 0.78 },
          horizontalAlignment: 'CENTER',
          verticalAlignment: 'MIDDLE'
        }
      },
      {
        userEnteredValue: { stringValue: "Status" },
        userEnteredFormat: { 
          textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
          backgroundColor: { red: 0.23, green: 0.57, blue: 0.78 },
          horizontalAlignment: 'CENTER',
          verticalAlignment: 'MIDDLE'
        }
      }
    ].concat(Array(2).fill({
      userEnteredFormat: {
        backgroundColor: { red: 0.23, green: 0.57, blue: 0.78 }
      }
    }))
  });
  
  // Empty insights rows
  rows.push({
    values: Array(5).fill({
      userEnteredValue: { stringValue: "" },
      userEnteredFormat: {
        wrapStrategy: "WRAP",
        horizontalAlignment: 'LEFT',
        verticalAlignment: 'MIDDLE'
      }
    }).concat(Array(2).fill({}))
  });
  
  rows.push({
    values: Array(5).fill({
      userEnteredValue: { stringValue: "" },
      userEnteredFormat: {
        wrapStrategy: "WRAP",
        horizontalAlignment: 'LEFT',
        verticalAlignment: 'MIDDLE'
      }
    }).concat(Array(2).fill({}))
  });
  
  return rows;
}

// Create an empty row for spacing
function emptyRow() {
  return { values: [] };
}
// Add this function to sheets-api.js right after the emptyRow function

// Generate the news and insights sections
function generateNewsAndInsightsSections() {
  const rows = [];
  
  // NEWS & UPDATES SECTION
  // Section Header
  rows.push({
    values: [
      {
        userEnteredValue: { stringValue: "NEWS & UPDATES" },
        userEnteredFormat: {
          textFormat: { bold: true, fontSize: 12 },
          backgroundColor: { red: 0.93, green: 0.93, blue: 0.93 },
          horizontalAlignment: 'CENTER',
          verticalAlignment: 'MIDDLE'
        }
      }
    ].concat(Array(6).fill({
      userEnteredFormat: {
        backgroundColor: { red: 0.93, green: 0.93, blue: 0.93 }
      }
    }))
  });
  
  // News header row
  rows.push({
    values: [
      {
        userEnteredValue: { stringValue: "Date" },
        userEnteredFormat: { 
          textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
          backgroundColor: { red: 0.23, green: 0.57, blue: 0.78 },
          horizontalAlignment: 'CENTER',
          verticalAlignment: 'MIDDLE'
        }
      },
      {
        userEnteredValue: { stringValue: "Title" },
        userEnteredFormat: { 
          textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
          backgroundColor: { red: 0.23, green: 0.57, blue: 0.78 },
          horizontalAlignment: 'CENTER',
          verticalAlignment: 'MIDDLE'
        }
      },
      {
        userEnteredValue: { stringValue: "Source" },
        userEnteredFormat: { 
          textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
          backgroundColor: { red: 0.23, green: 0.57, blue: 0.78 },
          horizontalAlignment: 'CENTER',
          verticalAlignment: 'MIDDLE'
        }
      },
      {
        userEnteredValue: { stringValue: "URL" },
        userEnteredFormat: { 
          textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
          backgroundColor: { red: 0.23, green: 0.57, blue: 0.78 },
          horizontalAlignment: 'CENTER',
          verticalAlignment: 'MIDDLE'
        }
      },
      {
        userEnteredValue: { stringValue: "Notes" },
        userEnteredFormat: { 
          textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
          backgroundColor: { red: 0.23, green: 0.57, blue: 0.78 },
          horizontalAlignment: 'CENTER',
          verticalAlignment: 'MIDDLE'
        }
      }
    ].concat(Array(2).fill({
      userEnteredFormat: {
        backgroundColor: { red: 0.23, green: 0.57, blue: 0.78 }
      }
    }))
  });
  
  // Empty news rows
  rows.push({
    values: Array(5).fill({
      userEnteredValue: { stringValue: "" },
      userEnteredFormat: {
        wrapStrategy: "WRAP",
        horizontalAlignment: 'LEFT',
        verticalAlignment: 'MIDDLE'
      }
    }).concat(Array(2).fill({}))
  });
  
  rows.push({
    values: Array(5).fill({
      userEnteredValue: { stringValue: "" },
      userEnteredFormat: {
        wrapStrategy: "WRAP",
        horizontalAlignment: 'LEFT',
        verticalAlignment: 'MIDDLE'
      }
    }).concat(Array(2).fill({}))
  });
  
  // Empty spacing row
  rows.push(emptyRow());
  
  // INSIGHTS SECTION
  // Section Header
  rows.push({
    values: [
      {
        userEnteredValue: { stringValue: "INSIGHTS & ACTION ITEMS" },
        userEnteredFormat: {
          textFormat: { bold: true, fontSize: 12 },
          backgroundColor: { red: 0.93, green: 0.93, blue: 0.93 },
          horizontalAlignment: 'CENTER',
          verticalAlignment: 'MIDDLE'
        }
      }
    ].concat(Array(6).fill({
      userEnteredFormat: {
        backgroundColor: { red: 0.93, green: 0.93, blue: 0.93 }
      }
    }))
  });
  
  // Insights header row
  rows.push({
    values: [
      {
        userEnteredValue: { stringValue: "Date" },
        userEnteredFormat: { 
          textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
          backgroundColor: { red: 0.23, green: 0.57, blue: 0.78 },
          horizontalAlignment: 'CENTER',
          verticalAlignment: 'MIDDLE'
        }
      },
      {
        userEnteredValue: { stringValue: "Insight" },
        userEnteredFormat: { 
          textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
          backgroundColor: { red: 0.23, green: 0.57, blue: 0.78 },
          horizontalAlignment: 'CENTER',
          verticalAlignment: 'MIDDLE'
        }
      },
      {
        userEnteredValue: { stringValue: "Source" },
        userEnteredFormat: { 
          textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
          backgroundColor: { red: 0.23, green: 0.57, blue: 0.78 },
          horizontalAlignment: 'CENTER',
          verticalAlignment: 'MIDDLE'
        }
      },
      {
        userEnteredValue: { stringValue: "Action Item" },
        userEnteredFormat: { 
          textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
          backgroundColor: { red: 0.23, green: 0.57, blue: 0.78 },
          horizontalAlignment: 'CENTER',
          verticalAlignment: 'MIDDLE'
        }
      },
      {
        userEnteredValue: { stringValue: "Status" },
        userEnteredFormat: { 
          textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
          backgroundColor: { red: 0.23, green: 0.57, blue: 0.78 },
          horizontalAlignment: 'CENTER',
          verticalAlignment: 'MIDDLE'
        }
      }
    ].concat(Array(2).fill({
      userEnteredFormat: {
        backgroundColor: { red: 0.23, green: 0.57, blue: 0.78 }
      }
    }))
  });
  
  // Empty insights rows
  rows.push({
    values: Array(5).fill({
      userEnteredValue: { stringValue: "" },
      userEnteredFormat: {
        wrapStrategy: "WRAP",
        horizontalAlignment: 'LEFT',
        verticalAlignment: 'MIDDLE'
      }
    }).concat(Array(2).fill({}))
  });
  
  rows.push({
    values: Array(5).fill({
      userEnteredValue: { stringValue: "" },
      userEnteredFormat: {
        wrapStrategy: "WRAP",
        horizontalAlignment: 'LEFT',
        verticalAlignment: 'MIDDLE'
      }
    }).concat(Array(2).fill({}))
  });
  
  return rows;
}
// Section 4: Contact Management

// Add a contact to the Contacts section
function addContactToSheet(spreadsheetId, contact) {
  return getAuthToken()
    .then(token => {
      // Format the data for the API
      const values = [
        [
          contact.name || '',
          contact.title || '',
          contact.email || '',
          contact.phone || '',
          contact.linkedin || '',
          '',
          new Date().toLocaleDateString()
        ]
      ];

      // Append the data - Using the values.append endpoint with the sheet title
      // We've updated the range to the Contacts section (starts at row 18)
      return fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'Account Plan'!A18:G18:append?valueInputOption=USER_ENTERED`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ values })
      });
    })
    .then(response => {
      if (!response.ok) {
        return response.text().then(text => {
          console.error('Error response:', text);
          try {
            const jsonError = JSON.parse(text);
            console.error('Error details:', jsonError);
          } catch (e) {
            // Not JSON
          }
          throw new Error('Failed to add contact');
        });
      }
      return response.json();
    });
}

// Get all contacts from a sheet
function getContactsFromSheet(spreadsheetId) {
  return getAuthToken()
    .then(token => {
      return fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'Account Plan'!A17:G30`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
    })
    .then(response => {
      if (!response.ok) {
        throw new Error('Failed to get contacts');
      }
      return response.json();
    })
    .then(data => {
      // Skip the header row
      const rows = data.values || [];
      if (rows.length <= 1) {
        return []; // No contacts yet besides the header
      }
      
      // Convert each row to a contact object
      return rows.slice(1).map(row => {
        if (!row[0]) return null; // Skip empty rows
        
        return {
          name: row[0] || '',
          title: row[1] || '',
          email: row[2] || '',
          phone: row[3] || '',
          linkedin: row[4] || '',
          notes: row[5] || '',
          lastContact: row[6] || ''
        };
      }).filter(contact => contact !== null); // Remove empty entries
    });
}

// Update an existing contact
function updateContact(spreadsheetId, rowIndex, contact) {
  return getAuthToken()
    .then(token => {
      // Format the data for the API
      const values = [
        [
          contact.name || '',
          contact.title || '',
          contact.email || '',
          contact.phone || '',
          contact.linkedin || '',
          contact.notes || '',
          contact.lastContact || new Date().toLocaleDateString()
        ]
      ];

      // The actual row is rowIndex + 17 (to account for headers and the section position)
      const actualRow = rowIndex + 17;
      
      return fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'Account Plan'!A${actualRow}:G${actualRow}?valueInputOption=USER_ENTERED`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ values })
      });
    })
    .then(response => {
      if (!response.ok) {
        throw new Error('Failed to update contact');
      }
      return response.json();
    });
}
// Update an existing Google Sheet with the account plan template
function updateExistingSheet(spreadsheetId, spreadsheetUrl, companyName) {
  console.log('Updating existing sheet for company:', companyName);
  console.log('Using spreadsheet ID:', spreadsheetId);
  
  if (!spreadsheetId) {
    return Promise.reject(new Error('No spreadsheet ID provided'));
  }
  
  return getAuthToken()
    .then(token => {
      if (!token) {
        throw new Error('Failed to obtain valid auth token');
      }
      
      console.log('Auth token obtained for updating sheet, length:', token.length);
      
      // Step 1: Get the sheets in the spreadsheet to find the first sheet
      return fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })
      .then(response => {
        if (!response.ok) {
          return response.text().then(text => {
            console.error('Error getting spreadsheet info:', text);
            throw new Error('Failed to get spreadsheet info');
          });
        }
        return response.json();
      })
      .then(data => {
        // Find the first sheet and get its ID
        console.log('Sheet properties:', data);
        
        if (!data.sheets || data.sheets.length === 0) {
          throw new Error('No sheets found in the spreadsheet');
        }
        
        const sheet = data.sheets[0]; // Use the first sheet
        
        if (!sheet.properties || sheet.properties.sheetId === undefined) {
          console.error('Sheet structure:', sheet);
          throw new Error('Sheet ID not found in response');
        }
        
        const sheetId = sheet.properties.sheetId;
        console.log('Using sheet ID:', sheetId);
        
        // Step 2: Update the spreadsheet title
        const updateTitleRequest = {
          requests: [
            {
              updateSpreadsheetProperties: {
                properties: {
                  title: `${companyName} - Account Plan`
                },
                fields: 'title'
              }
            }
          ]
        };
        
        return fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(updateTitleRequest)
        })
        .then(response => {
          if (!response.ok) {
            return response.text().then(text => {
              console.error('Error updating title:', text);
              throw new Error('Failed to update spreadsheet title');
            });
          }
          return response.json();
        })
        .then(() => {
          // Step 3: Clear all existing content from the first sheet
          const sheetName = sheet.properties.title || 'Sheet1';
          const clearRange = `'${sheetName}'!A1:Z1000`;
          console.log('Clearing range:', clearRange);
          
          return fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(clearRange)}:clear`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          });
        })
        .then(response => {
          if (!response.ok) {
            return response.text().then(text => {
              console.error('Error clearing sheet:', text);
              // Continue anyway, might be a naming issue
              console.log('Continuing with template population');
            });
            return; // Continue even if clearing fails
          }
          return response;
        })
        .then(() => {
          // Step 4: Apply our template to the sheet
          // Create a spreadsheet-like object for the populateTemplate function
          const spreadsheetObj = {
            spreadsheetId: spreadsheetId,
            url: spreadsheetUrl
          };
          
          // Populate the template
          return populateTemplate(spreadsheetId, companyName)
            .then(() => {
              // Store the spreadsheet information in chrome.storage.local
              return new Promise((resolve, reject) => {
                chrome.storage.local.get(['accountPlans'], function(result) {
                  if (chrome.runtime.lastError) {
                    console.error('Error getting account plans:', chrome.runtime.lastError);
                    reject(new Error('Failed to retrieve account plans'));
                    return;
                  }
                  
                  const accountPlans = result.accountPlans || {};
                  accountPlans[companyName] = {
                    id: spreadsheetId,
                    url: spreadsheetUrl,
                    created: new Date().toISOString()
                  };
                  
                  chrome.storage.local.set({accountPlans: accountPlans}, function() {
                    if (chrome.runtime.lastError) {
                      console.error('Error saving account plan:', chrome.runtime.lastError);
                      reject(new Error('Failed to save account plan details'));
                      return;
                    }
                    
                    // Return the spreadsheet object
                    resolve(spreadsheetObj);
                  });
                });
              });
            });
        });
      });
    })
    .catch(error => {
      console.error('Error in updateExistingSheet:', error);
      
      // Check if it's an authentication error and try to refresh
      if (error.message && (error.message.includes('token') || error.message.includes('auth') || 
          error.message.includes('UNAUTHENTICATED'))) {
        return refreshAuthToken()
          .then(newToken => {
            console.log('Token refreshed, retrying updateExistingSheet...');
            return updateExistingSheet(spreadsheetId, spreadsheetUrl, companyName);
          })
          .catch(refreshError => {
            console.error('Token refresh failed during update:', refreshError);
            throw new Error('Authentication failed during update. Please sign in again.');
          });
      }
      
      throw error;
    });
}

// Direct debug function for updating the current sheet
function debugDirectUpdateSheet(companyName) {
  console.log('Debug: Directly updating current sheet for company:', companyName);
  
  // Get the current spreadsheet ID from storage
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(['currentSpreadsheetId'], function(result) {
      if (chrome.runtime.lastError) {
        console.error('Error getting spreadsheet ID from storage:', chrome.runtime.lastError);
        reject(new Error('Failed to get spreadsheet ID from storage'));
        return;
      }
      
      const spreadsheetId = result.currentSpreadsheetId;
      if (!spreadsheetId) {
        console.error('No spreadsheet ID found in storage');
        reject(new Error('No spreadsheet ID found'));
        return;
      }
      
      console.log('Found spreadsheet ID in storage:', spreadsheetId);
      // Get the current URL
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        const currentTab = tabs[0];
        const spreadsheetUrl = currentTab.url;
        
        // Call the update function
        updateExistingSheet(spreadsheetId, spreadsheetUrl, companyName)
          .then(result => {
            console.log('Update successful:', result);
            resolve(result);
          })
          .catch(error => {
            console.error('Update failed:', error);
            reject(error);
          });
      });
    });
  });
}