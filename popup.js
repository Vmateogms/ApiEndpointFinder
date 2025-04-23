document.addEventListener('DOMContentLoaded', function() {
    const botonInicio = document.getElementById('startButton');
    const botonParar = document.getElementById('stopButton');
    const botonExportar = document.getElementById('exportButton');
    const apiUrlInput = document.getElementById('apiUrl');
    const concurrency = document.getElementById('concurrency');
    const resultadosContainer = document.getElementById('resultsContainer');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    const wordpressCheckbox = document.getElementById('wordpressMode');
    const detectWpButton = document.getElementById('detectWordpress');
    const endpointTypeSelect = document.getElementById('endpointType');

    let commonEndpoints = [];
    let isTestRunning = false;
    let deberiaParar = false;
    let resultados = [];
    let endpointsToTest = [];
    let filtrosActivos = {
        '200': true,
        '404': false,
        '500': false
    };
    let currentProgress = {
        completed: 0,
        total: 0,
        percentage: 0
    };

    // Cargamos endpoints desde el .txt
    fetch('endpoints.txt')
        .then(response => response.text())
        .then(text => {
            commonEndpoints = text.split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0);
            console.log(`Cargados ${commonEndpoints.length} endpoints para pruebas`);  
            
            //actualizar el limite maximo para el input
            const limitInput = document.getElementById('limit');
            limitInput.max = commonEndpoints.length;
            limitInput.title = `Maximo disponible: ${commonEndpoints.length}`;
        })
        .catch(error => {
            console.error('Error cargando endpoints:', error);
            // FallBack a una lista básica en caso de error
            commonEndpoints = ["id", "email", "user", "name", "page"];
            const limitInput = document.getElementById('limit');
            limitInput.max = commonEndpoints.length;
            limitInput.title = `Máximo disponible: ${commonEndpoints.length}`;
        });

    fetch('wordpress_endpoints.txt')
        .then(response => response.text())
        .then(text => {
            wordpressEndpoints = text.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0 && !line.startsWith('#'));
        console.log(`Cargados ${wordpressEndpoints.length} endpoints de wordpress para pruebas`);
        }) .catch(error => {
            console.error('Error cargando endpoints de WordPress:', error)
            // FallBack a una lista básica de endpoints de WordPress
            wordpressEndpoints = [
                "wp-json",
                "wp-json/wp/v2/posts",
                "wp-json/wp/v2/pages",
                "wp-json/wp/v2/categories",
                "wp-json/wp/v2/tags",
                "wp-json/wp/v2/users",
                "wp-json/wp/v2/comments",
                "wp-json/wp/v2/media",
                "wp-json/wp/v2/types",
                "wp-json/wp/v2/statuses",
                "wp-json/wp/v2/taxonomies",
                "wp-json/wp/v2/settings"
            ];
        });

        endpointTypeSelect.addEventListener('change', function() {
            const selectedValue = this.value;
            const limitInput = document.getElementById('limit');

            if(selectedValue === 'wordpress') {
                //Activar wordpress
                wordpressCheckbox.checked = true;
                limitInput.max = wordpressEndpoints.length;
                limitInput.value = Math.min(limitInput.value, wordpressEndpoints.length);
                limitInput.title = `Maximo disponible ${wordpressEndpoints.length}`;
                document.getElementById('wpOptionsContainer').classList.remove('d-none');
            } else if (selectedValue === 'mixed') {
                //modo mixto wordpress + comun
                wordpressCheckbox.checked = true;
                const totalEndpoints = wordpressEndpoints.length + commonEndpoints.length;
                limitInput.max = totalEndpoints;
                limitInput.title = `Maximo disponible: ${totalEndpoints}`;
                document.getElementById('wpOptionsContainer').classList.remove('d-none');
            } else {
                //modo normal (solo endpoints comunes)
                wordpressCheckbox.checked = false;
                limitInput.max = commonEndpoints.length;
                limitInput.value = Math.min(limitInput.value, commonEndpoints.length);
                limitInput.title = `Maximo disponible: ${commonEndpoints.length}`;
                document.getElementById('wpOptionsContainer').classList.add('d-none'); 
            }
        });


    //detectar si un sitio usa wordpress
    detectWpButton.addEventListener('click', async function () {
        const baseUrl = apiUrlInput.value.trim();

        if (!baseUrl) {
            alert('Por favor, introduce una URL base valida');
            return;
        }

        try {
            new URL (baseUrl);
        } catch (e) {
            alert('URL no válida. Asegúrate de incluir http:// o https://');
            return;
        }

        detectWpButton.disabled = true;
        detectWpButton.textContent = 'Detectando...';

        try {
            const result = await detectWordpress(baseUrl);
            
            if (result.isWordPress) {
                const message = result.siteName ? 
                    `¡WordPress detectado! (${result.confidence.toFixed(0)}% confianza)\nNombre del sitio: ${result.siteName}` :
                    `¡WordPress detectado! (${result.confidence.toFixed(0)}% confianza)`;
                    
                alert(message);
                endpointTypeSelect.value = 'wordpress';
                endpointTypeSelect.dispatchEvent(new Event('change'));
                apiUrlInput.value = baseUrl;
            } else {
                alert(`No se detecto WordPress (${result.confidence.toFixed(0)}% confianza)`);
            }
        } catch (error) {
            console.error('Error detectando WordPress:', error);
            alert(`Error al detectar WordPress: ${error.message}`);
        } finally {
            detectWpButton.disabled = false;
            detectWpButton.textContent = 'Detectar WordPress';
        }
    });

    botonInicio.addEventListener('click', async function() {
        // Limpiar resultados anteriores
        resultadosContainer.innerHTML = '';
        resultados = [];
        botonExportar.disabled = true;

        const limit = parseInt(document.getElementById('limit').value) || commonEndpoints.length;
        const selectedEndpointType = endpointTypeSelect.value;
        
        
        //determinar que endoints probar segun el modo seleccionado
        if (selectedEndpointType === 'wordpress') {
            endpointsToTest = wordpressEndpoints.slice(0, Math.min(limit, wordpressEndpoints.length));
        } else if (selectedEndpointType === "mixed") {
            //mezclar endpoints de wordpress y comunes
            endpointsToTest = [...wordpressEndpoints, ...commonEndpoints].slice(0, Math.min(limit, wordpressEndpoints.length + commonEndpoints.length));
        } else {
            endpointsToTest = commonEndpoints.slice(0, Math.min(limit, commonEndpoints.length));
        }
        
        // Actualizar el texto de progreso con el límite
        progressText.textContent = `0/${endpointsToTest.length} de ${commonEndpoints.length} totales`;

        const baseUrl = apiUrlInput.value.trim().replace(/\/$/, '');
    
        if (!baseUrl) {
            alert('Por favor, introduce una URL de API valida');
            return;
        }

        if(commonEndpoints.length === 0) {
            alert('No se han cargado endpoints para probar');
            return;
        }

        const concurrencyValue = parseInt(concurrency.value) || 10;

        // Actualizar UI
        botonInicio.disabled = true;
        isTestRunning = true;
        deberiaParar = false;
        botonParar.disabled = false;
        botonInicio.textContent = 'Probando...';

        try {
            const startTime = Date.now();
            resultados = await testEndpoints(baseUrl, concurrencyValue, endpointsToTest);
            if(resultados.length > 0) {
                //calcular estadisticas
                const exitosos = resultados.filter(r => r.success).length;
                const errores = resultados.filter(r => !r.success).length;
                const tiempo = ((Date.now() - startTime) / 1000).toFixed(2);

                //Encontrar el endpoint mas rapido
                let endpointMasRapido = { endpoint: 'N/A', tiempo: Infinity};
                resultados.forEach(r => {
                    if (r.responseTime < endpointMasRapido.tiempo && r.success) {
                        endpointMasRapido = { endpoint: r.endpoint, tiempo: r.responseTime };
                    }
                });

                //Crear elemento de estadisticas
                const stats = document.createElement('div');
                stats.className = 'alert alert-info mt-3';
                stats.innerHTML = `
                <h5 class="alert-heading">Resumen de la prueba</h5>
                <p>Endpoints probados: ${resultados.length}</p>
                <p>Exitosos (200 OK): <span class="text-success">${exitosos}</span></p>
                <p>Errores: <span class="text-danger">${errores}</span></p>
                <p>Tiempo total: ${tiempo} segundos</p>
                <hr>
                <p class="mb-0">Endpoint con mejor tiempo de respuesta: ${endpointMasRapido.endpoint}ms</p>
                `;
                resultadosContainer.prepend(stats);
                botonExportar.disabled = false;
            }
        } catch (error) {
            console.error('Error probando endpoints; ', error);
            addResultEntry('Error', `Fallo al completar las pruebas: ${error.message}`, 'error');
        } finally {
            isTestRunning = false;
            botonParar.disabled = true;
            botonInicio.disabled = false;
            botonInicio.textContent = 'Iniciar Prueba';
        }
    });

    botonParar.addEventListener('click', function() {
        if (isTestRunning) {
            deberiaParar = true;
            botonParar.disabled = true;
            botonParar.textContent = 'Deteniendo...⌛';
            setTimeout(() => {
                botonParar.textContent = 'Detener';
            }, 1000);
        }
    });

    botonExportar.addEventListener('click', function() {
        if (resultados.length === 0) return;

        let csv = 'Endpoint,Url,Status,ContentLength,EsExitoso,TiempoRespuesta\n';
        resultados.forEach(item => {
            csv += `${item.endpoint},${item.url},${item.status},${item.contentLength},${item.success},${item.responseTime ||'N/A'}\n`;
        });

        const blob = new Blob([csv], {type: 'text/csv'});
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = 'api_test_resultados.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    });

    async function testEndpoints(baseUrl, concurrency) {
        const total = endpointsToTest.length;//commonEndpoints.length;
        let completed = 0;
        //let queue = [...commonEndpoints];
        let queue = [...endpointsToTest];
        let active = 0;
        let resultsArray = [];


        progressText.textContent = `0/${total} (0%)`;
        progressBar.style.width = '0%';

        // progressText.textContent = `${completed}/${endpointsToTest.length} (${Math.round((completed / endpointsToTest.length) * 100)}%)`;
        // progressBar.style.width = '0%';
        
        return new Promise((resolve) => {
            function processQueue() {
                if (deberiaParar || (queue.length === 0 && active === 0)) {
                    if (deberiaParar) {
                        progressText.textContent += 'Detenido por el usuario';
                    }
                    resolve(resultsArray);
                    return;
                }
                while (active < concurrency && queue.length > 0) {
                    const endpoint = queue.shift();
                    active++;

                    //prepara la url segun el tipo de endpoint
                    let url;
                    if (endpoint.startsWith('wp-json')) {
                        //URL wordpress sin duplicar
                        if (baseUrl.endsWith('wp-json')) {
                            url = `${baseUrl}${endpoint.substring(7)}`;
                        } else {
                            url = `${baseUrl}/${endpoint}`;
                        }
                    } else {
                        url = `${baseUrl}/${endpoint}`;
                    }

                    const startTime = performance.now();

                    fetch(url, {
                        method: 'GET',
                        headers: {
                            'Accept': 'application/json'
                        }
                    })
                    .then(response => {
                        const endTime = performance.now();
                        const responseTime = endTime - startTime;

                        const contentType = response.headers.get('Content-Type') || '';
                        const esJson = contentType.includes('application/json');
                        const contentLength = response.headers.get('Content-Length') || 'Desconocido';

                        let statusClass = 'otros-status';
                        if (response.status === 200) statusClass = 'status-200';
                        else if(response.status === 404) statusClass = 'status-404';
                        else if(response.status >= 500) statusClass = 'status-500';

                        resultsArray.push({
                            endpoint,
                            url,
                            status: response.status,
                            success: esJson && response.status === 200,
                            contentLength: contentLength,
                            responseTime: responseTime,
                            isWordpress: endpoint.startsWith('wp-json')
                        });

                        addResultEntry(endpoint, url, statusClass, response.status);
                    })
                    .catch(error => {
                        console.error(`Error fetching ${endpoint}:`, error);
                        //registramos error tambien
                        resultsArray.push({
                            endpoint,
                            url,
                            status:'Error',
                            success: false,
                            contentLength: 'N/A',
                            responseTime: 0,
                            isWordpress: endpoint.startsWith('wp-json')
                        });
                        addResultEntry(endpoint, url, 'error', 'Error de conexion');
                    })
                    .finally(() => {
                        active--;
                        completed++;

                         // Actualizar progreso con porcentaje
                         const porcentaje = Math.round((completed / total) * 100);
                         progressBar.style.width = `${porcentaje}%`;
                         progressText.textContent = `${completed}/${total} (${porcentaje}%)`;

                        // Procesar el siguiente endpoint o finalizar
                        processQueue();
                    });
                }
            }

            // Iniciar el procesamiento
            processQueue();
        });
    }

    async function detectWordpress(baseUrl) {
        baseUrl = baseUrl.trim().replace(/\/$/, '');

        //Indicadores comunes de wordpress 
        const wpIndicadores = [
            { path: '/wp-json', type: 'json' },
            { path: '/wp-content/themes/', type: 'head' },
            { path: '/wp-login.php', type: 'head' },
            { path: '/wp-includes/css/dist/block-library/style.min.css', type: 'head' },
            { path: '/feed/', type: 'xml' }
        ];

        let puntosDetectados = 0;
        let siteName = '';

        for (const indicador of wpIndicadores) {
            try {
                const url =  `${baseUrl}${Indicadores.path}`;
                const response = await fetch (url, {
                    metho: 'GET',
                    headers: {
                        'Accept': indicador.type === 'json' ? 'application/json' : 'text/html'
                    }
                });

                if(response.ok) {
                    puntosDetectados++;

                    if(indicador.path === '/wp-json') {
                        try {
                            const data = await response.json();
                            if(data && data.name) {
                                siteName = data.name;
                            }
                        } catch (e) {
                            console.log('No se puedo parseas JSON de el wp-json endpoint')
                        }
                    }
                }

            } catch (error) {
                console.log(`Error checking ${indicador.path}: ${error.message}`);
            }
        }

        //considerarlo wordpress si al menos 2 indicadores estan presentes
        return {
        isWordPress: puntosDetectados >= 2,
        confidence: (puntosDetectados / wpIndicadores.length) * 100,
        siteName: siteName
        };

    }

    function addResultEntry(endpoint, url, className, status) {
        if (!cumpleFiltros(status)) return; 
        
        const entry = document.createElement('div');
        entry.className = `list-group-item d-flex justify-content-between align-items-center ${className === 'status-200' ? 'success' : ''}`;

        const endpointDiv = document.createElement('div');
        endpointDiv.innerHTML = `
        <span class="endpoint-status ${className}">${status || 'ERROR'}</span>
        <span>${endpoint}</span>
        `;

        const urlLink = document.createElement('a');
        urlLink.href = url;
        urlLink.className = 'small results-url';
        urlLink.textContent = url;
        urlLink.target = '_blank';

        entry.appendChild(endpointDiv);
        entry.appendChild(urlLink);
        resultadosContainer.appendChild(entry);
    }

    function cumpleFiltros(status) {
        if (filtrosActivos['200'] && status === 200) return true;
        if (filtrosActivos['404'] && status === 404) return true;
        if (filtrosActivos['500'] && status >= 500) return true;
        return false;
    }

    // Event listeners para los checkboxes
    document.getElementById('filter200').addEventListener('change', (e) => {
    filtrosActivos['200'] = e.target.checked;
    refreshResults();
    });

    document.getElementById('filter404').addEventListener('change', (e) => {
    filtrosActivos['404'] = e.target.checked;
    refreshResults();
    });

    document.getElementById('filter500').addEventListener('change', (e) => {
    filtrosActivos['500'] = e.target.checked;
    refreshResults();
    });

// Función para re-renderizar resultados
function refreshResults() {
    resultadosContainer.innerHTML = '';
    resultados.forEach(item => {
        if (cumpleFiltros(item.status)) {
            addResultEntry(item.endpoint, item.url, getStatusClass(item.status), item.status);
        }
    });
}

// Función auxiliar para clases CSS
function getStatusClass(status) {
    if (status === 200) return 'status-200';
    if (status === 404) return 'status-404';
    if (status >= 500) return 'status-500';
    return 'otros-status';
}

function updateProgress(completed, total) {
const porcentaje = Math.round((completed / total) * 100);
progressBar.style.width = `${porcentaje}%`;
progressText.textContent = `${completed}/${total} (${porcentaje}%)`;

currentProgress = { completed, total, percentage };
chrome.storage.local.set({
    currentProgress,
    isTestRunning: isTestRunning,
    resultados: resultados
});

}

updateProgress(completed, total);

function updateStatus(status) {
    const statusIndicator = document.getElementById('statusIndicator');
    
    if (status === 'active') {
        statusIndicator.className = 'badge bg-success';
        statusIndicator.textContent = 'Activo';
    } else if (status === 'paused') {
        statusIndicator.className = 'badge bg-warning';
        statusIndicator.textContent = 'Pausado';
    } else {
        statusIndicator.className = 'badge bg-secondary';
        statusIndicator.textContent = 'Inactivo';
    }
    
    // Update icon badge for when popup is closed
    chrome.action.setBadgeText({text: status === 'active' ? '⚡' : ''});
    chrome.action.setBadgeBackgroundColor({color: status === 'active' ? '#198754' : '#6c757d'});
}

//despues de la carga del dom, restaurar estado
chrome.storage.local.get(['resultados', 'isTestRunning', 'currentProgress'], function(data) {
    if (data.resultados && data.resultados.length > 0) {
        resultados = data.resultados;
        refreshResults();
        botonExportar.disabled = false;

        //si hay un test ocurriendo
        if (data.isTestRunning) {
            //mostrar progreso
            if (data.currentProgress) {
                const {completed, total, percentage} = data.currentProgress;
                progressBar.style.width = `${percentage}%`;
                progressText.textContent = `${completed}/${total} (${percentage}%)`;
            }

            if (confirm('Se encontró una prueba en curso. ¿Deseas continuarla?')) {
                botonInicio.click();
            } else {
                chrome.storage.local.set({isTestRunning: false});
            }

        }
    }
})

});