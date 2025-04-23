// gaurdar los fetch en progreso
let activeRequests = [];
let isTestRunning = false;

// escuchar mensajes de el popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'startTest') {
        isTestRunning = true;
        // empezar la logica o controlar estado
        sendResponse({status: 'started'});
        return true;
    }
    else if (request.action === 'stopTest') {
        isTestRunning = false;
        // cancelar todos los request
        activeRequests.forEach(controller => {
            if (controller) controller.abort();
        });
        activeRequests = [];
        sendResponse({status: 'stopped'});
        return true;
    }
    else if (request.action === 'getStatus') {
        sendResponse({
            isRunning: isTestRunning
        });
        return true;
    }
});

// funcion para probar endpoints en el background
function testEndpointInBackground(url, endpoint) {
    return new Promise((resolve, reject) => {
        const controller = new AbortController();
        const signal = controller.signal;
        activeRequests.push(controller);
        
        fetch(url, { 
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            signal: signal
        })
        .then(response => {
            // Process response...
            resolve(result);
        })
        .catch(error => {
            reject(error);
        })
        .finally(() => {
            // Remove this controller from active requests
            const index = activeRequests.indexOf(controller);
            if (index > -1) activeRequests.splice(index, 1);
        });
    });
}