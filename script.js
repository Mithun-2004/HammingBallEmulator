const process_btn = document.getElementById('process-button');
const generate_mat_input = document.getElementById('generator-matrix');
const err_element = document.getElementById('error-message');
const mat_info_elt = document.getElementById('matrix-info');
const visualizationContainer = document.getElementById('visualization');
const sigma_wrapper = document.getElementById('sigma-wrapper');
const inst_panel = document.querySelector('.instruction-panel');
const full_view_leg = document.querySelector('.full-view-legend');
const select_view_leg = document.querySelector('.selected-view-legend');
const ctrl_panel = document.querySelector('.control-panel');
const reset_btn = document.getElementById('reset-view');
const rad_dropdown = document.getElementById('radius-dropdown');
const apply_radbtn = document.getElementById('apply-radius');
const ham_ball_info = document.getElementById('hamming-ball-info');
const selected_cw = document.getElementById('selected-codeword-text');
const selected_view_dist = document.getElementById('selected-view-distance-text');
const full_view_dist = document.getElementById('full-view-distance-text');
const ctrl_panel_cw = document.getElementById('control-panel-codeword');

let globalCodewords = [];
let globalAllWords = [];
let globalMinDistance = 0;
let globalSigmaInstance = null;
let selectedCodeword = null;

process_btn.addEventListener('click', processMatrix);

function processMatrix() {
    const matrixText = generate_mat_input.value.trim();

    err_element.textContent = '';
    mat_info_elt.innerHTML = '';
    if (globalSigmaInstance) {
        globalSigmaInstance.kill();
        globalSigmaInstance = null;
    }
    sigma_wrapper.innerHTML = '';
    ham_ball_info.innerHTML = '';
    inst_panel.classList.add('hidden');
    full_view_leg.classList.add('hidden');
    select_view_leg.classList.add('hidden');
    ctrl_panel.classList.add('hidden');
    reset_btn.classList.add('hidden');
    selectedCodeword = null;

    try {
        const matrix = parseMatrix(matrixText);
        const validationResult = validateMatrix(matrix);

        if (!validationResult.valid) {
            err_element.textContent = validationResult.error;
            return;
        }

        const [k, n] = [matrix.length, matrix[0].length];
        if (n > 10) {
            err_element.textContent = `Warning: n=${n} is large. Visualization might be slow or unstable. Maximum recommended n is 10.`;
        }

        const codeRate = (k / n).toFixed(3);
        const numCodeWords = Math.pow(2, k);
        const numTotalWords = Math.pow(2, n);
        const codewords = generateCodewords(matrix);
        const dmin = minimumHammingDistance(codewords);
        const [t, e] = errorDetectionAndCorrection(dmin);

        globalCodewords = codewords;
        globalAllWords = generateWords(n);
        globalMinDistance = dmin;

        mat_info_elt.innerHTML = `
            <p><strong>Matrix dimensions:</strong> ${k} × ${n}</p>
            <p><strong>Code parameters:</strong> [${n}, ${k}]</p>
            <p><strong>Code rate:</strong> ${codeRate}</p>
            <p><strong>Number of words:</strong> 2<sup>${n}</sup> = ${numTotalWords.toLocaleString()}</p>
            <p><strong>Number of codewords:</strong> 2<sup>${k}</sup> = ${numCodeWords.toLocaleString()}</p>
            <p><strong>Minimum hamming distance between two codewords:</strong> ${dmin}</p>
            <p><strong>Error detection capability:</strong> ${t}</p>
            <p><strong>Error correction capability:</strong> ${e}</p>
        `;

        displayNetwork(codewords, globalAllWords);

    } catch (error) {
        err_element.textContent = `Error: ${error.message}`;
        console.error("Processing error:", error);
    }
}

function parseMatrix(matrixText) {
    const rows = matrixText.split('\n').map(row => row.trim()).filter(row => row !== '');

    if (rows.length === 0) {
        throw new Error('Empty matrix provided.');
    }

    let n_cols = 0;

    const matrix = rows.map((row, rowIndex) => {
        const elements = row.split(/[\s,]+/).filter(elem => elem !== '').map(elem => {
            const parsed = parseInt(elem, 10);
            if (isNaN(parsed) || (parsed !== 0 && parsed !== 1)) {
                throw new Error(`Invalid element at row ${rowIndex + 1}: '${elem}'. Only binary (0 or 1) values are allowed.`);
            }
            return parsed;
        });

        if (elements.length === 0 && rows.length > 0) {
            throw new Error(`Row ${rowIndex + 1} contains invalid characters or is effectively empty.`);
        }

        if (rowIndex === 0) {
            n_cols = elements.length;
            if (n_cols === 0) {
                throw new Error('Matrix must have at least one column.');
            }
        } else if (elements.length !== n_cols) {
            throw new Error(`Inconsistent row lengths. Row 1 has ${n_cols} elements, but row ${rowIndex + 1} has ${elements.length} elements.`);
        }

        return elements;
    });

    return matrix;
}

function validateMatrix(matrix) {
    const k = matrix.length;
    if (k === 0) {
        return { valid: false, error: 'Matrix has no rows.' };
    }
    const n = matrix[0].length;
    if (n === 0) {
        return { valid: false, error: 'Matrix has no columns.' };
    }

    if (k > n) {
        return {
            valid: false,
            error: `Invalid matrix dimensions: k (${k}) must be less than or equal to n (${n}) for a valid generator matrix.`
        };
    }

    const matrixCopy = matrix.map(row => [...row]);
    let rank = 0;
    let pivotCol = 0;

    while (rank < k && pivotCol < n) {
        let pivotRow = -1;
        for (let i = rank; i < k; i++) {
            if (matrixCopy[i][pivotCol] === 1) {
                pivotRow = i;
                break;
            }
        }

        if (pivotRow !== -1) {
            if (pivotRow !== rank) {
                [matrixCopy[rank], matrixCopy[pivotRow]] = [matrixCopy[pivotRow], matrixCopy[rank]];
            }
            for (let i = 0; i < k; i++) {
                if (i !== rank && matrixCopy[i][pivotCol] === 1) {
                    for (let j = pivotCol; j < n; j++) {
                        matrixCopy[i][j] = (matrixCopy[i][j] + matrixCopy[rank][j]) % 2;
                    }
                }
            }
            rank++;
        }
        pivotCol++;
    }

    if (rank < k) {
        return {
            valid: false,
            error: `The matrix rows are linearly dependent (rank ${rank} < k=${k}). Cannot form a valid generator matrix.`
        };
    }

    return { valid: true };
}

function generateCodewords(G) {
    const k = G.length;
    const n = G[0].length;
    const codewords = [];
    const numMessages = 1 << k;

    for (let i = 0; i < numMessages; i++) {
        const message = Array.from(i.toString(2).padStart(k, '0')).map(Number);
        const codeword = new Array(n).fill(0);

        for (let j = 0; j < n; j++) {
            let bitSum = 0;
            for (let row = 0; row < k; row++) {
                bitSum = (bitSum + message[row] * G[row][j]) % 2;
            }
            codeword[j] = bitSum;
        }

        codewords.push(codeword.join(""));
    }

    if (k > 0 && !codewords.includes("0".repeat(n))) {
        console.warn("Zero codeword was not generated, adding it manually. Check matrix.");
        codewords.push("0".repeat(n));
    }

    return codewords;
}

function hammingDistance(word1, word2) {
    if (word1.length !== word2.length) {
        console.error("Hamming distance error: words have different lengths.", word1, word2);
        return Infinity;
    }
    let distance = 0;
    for (let i = 0; i < word1.length; i++) {
        if (word1[i] !== word2[i]) {
            distance++;
        }
    }
    return distance;
}

function minimumHammingDistance(words) {
    let minimumDistance = Infinity;

    for (let i = 0; i < words.length; i++) {
        for (let j = i + 1; j < words.length; j++) {
            const distance = hammingDistance(words[i], words[j]);
            if (distance < minimumDistance) {
                minimumDistance = distance;
            }
        }
    }

    return minimumDistance;
}

function errorDetectionAndCorrection(minHammingDistance) {
    if (minHammingDistance === Infinity || minHammingDistance <= 0) {
        return [0, 0];
    }
    const errorDetection = minHammingDistance - 1;
    const errorCorrection = Math.floor((minHammingDistance - 1) / 2);

    return [errorDetection, errorCorrection];
}

function generateWords(n) {
    const words = [];
    const totalWords = 1 << n;

    for (let i = 0; i < totalWords; i++) {
        const binaryWord = i.toString(2).padStart(n, '0');
        words.push(binaryWord);
    }

    return words;
}

function displayNetwork(codewords, allWords, selectedWord = null, customRadius = null) {
    if (globalSigmaInstance) {
        globalSigmaInstance.kill();
        globalSigmaInstance = null;
    }

    sigma_wrapper.innerHTML = '';

    const correctionRadius = customRadius !== null ?
        customRadius :
        Math.floor((globalMinDistance - 1) / 2);

    if (selectedWord) {
        inst_panel.classList.add('hidden');
        full_view_leg.classList.add('hidden');
        select_view_leg.classList.remove('hidden');
        ctrl_panel.classList.remove('hidden');
        reset_btn.classList.remove('hidden');

        selected_cw.textContent = `Selected Codeword: ${selectedWord}`;
        selected_view_dist.textContent = `Hamming distance = ${correctionRadius}`;

        ctrl_panel_cw.textContent = selectedWord;

        rad_dropdown.innerHTML = '';

        const n = allWords[0]?.length || 1;
        for (let i = 1; i <= n; i++) {
            const option = document.createElement('option');
            option.value = i;
            option.textContent = i;
            if (i === correctionRadius) {
                option.selected = true;
            }
            rad_dropdown.appendChild(option);
        }
    } else {
        inst_panel.classList.remove('hidden');
        full_view_leg.classList.remove('hidden');
        select_view_leg.classList.add('hidden');
        ctrl_panel.classList.add('hidden');
        reset_btn.classList.add('hidden');

        const defaultCorrectionRadius = Math.floor((globalMinDistance - 1) / 2);
        full_view_dist.textContent = `Hamming distance ≤ ${defaultCorrectionRadius}`;
    }

    const graph = new graphology.Graph();
    const codewordSet = new Set(codewords);

    allWords.forEach((word, index) => {
        const isCodeword = codewordSet.has(word);
        const isSelected = selectedWord === word;
        let shouldAdd = false;

        if (selectedWord) {
            const distance = hammingDistance(selectedWord, word);
            shouldAdd = (isSelected || distance === correctionRadius);
        } else {
            shouldAdd = true;
        }

        if (shouldAdd) {
            graph.addNode(word, {
                label: word,
                size: isSelected ? 15 : (isCodeword ? 10 : 5),
                color: isSelected ? '#ff9800' : (isCodeword ? '#e74c3c' : '#3498db'),
                x: Math.random(),
                y: Math.random(),
                isCodeword: isCodeword
            });
        }
    });

    if (selectedWord) {
        if (graph.hasNode(selectedWord)) {
            graph.forEachNode((nodeId, attrs) => {
                if (nodeId !== selectedWord) {
                    const distance = hammingDistance(selectedWord, nodeId);
                    if (distance === correctionRadius) {
                        graph.addEdge(selectedWord, nodeId, {
                            size: 2,
                            color: '#9b59b6'
                        });
                    }
                }
            });
        }
    } else {
        const defaultCorrectionRadius = Math.floor((globalMinDistance - 1) / 2);
        codewords.forEach(codeword => {
            if (graph.hasNode(codeword)) {
                graph.forEachNode((otherNodeId, otherAttrs) => {
                    if (codeword !== otherNodeId && !otherAttrs.isCodeword) {
                        const distance = hammingDistance(codeword, otherNodeId);
                        if (distance > 0 && distance <= defaultCorrectionRadius) {
                            if (!graph.hasEdge(codeword, otherNodeId) && !graph.hasEdge(otherNodeId, codeword)) {
                                graph.addEdge(codeword, otherNodeId, {
                                    size: 1,
                                    color: '#bdc3c7'
                                });
                            }
                        }
                    }
                });
            }
        });
    }

    if (graph.order > 0) {
        const positions = forceAtlas2Layout(graph, 1000);

        Object.keys(positions).forEach(nodeId => {
            if (graph.hasNode(nodeId)) {
                const pos = positions[nodeId];
                graph.setNodeAttribute(nodeId, 'x', pos.x);
                graph.setNodeAttribute(nodeId, 'y', pos.y);
            }
        });
    }

    try {
        const renderer = new Sigma(graph, sigma_wrapper, {
            renderLabels: true,
            labelSize: 12,
            labelColor: {
                color: '#000000'
            },
            allowInvalidContainer: true,
        });

        renderer.on('clickNode', ({ node }) => {
            const nodeId = node;
            if (globalCodewords.includes(nodeId)) {
                selectedCodeword = nodeId;
                displayNetwork(globalCodewords, globalAllWords, nodeId, 1);
            }
        });

        globalSigmaInstance = renderer;

    } catch (e) {
        console.error("Error initializing Sigma:", e);
        sigma_wrapper.innerHTML = "<p style='color:red; padding: 10px;'>Error displaying graph.</p>";
    }

    updateHammingBallInfo(selectedWord, correctionRadius);
}

function updateHammingBallInfo(selectedWord, currentRadius) {
    const defaultCorrectionRadius = Math.floor((globalMinDistance - 1) / 2);

    if (selectedWord) {
        const exactDistanceCount = globalAllWords.filter(word =>
            word !== selectedWord && hammingDistance(selectedWord, word) === currentRadius
        ).length;

        ham_ball_info.innerHTML = `
            <p>Selected codeword: <strong>${selectedWord}</strong></p>
            <p>Displaying Hamming sphere with radius: <strong>${currentRadius}</strong></p>
            <p>Number of words exactly at this distance: <strong>${exactDistanceCount}</strong></p>
             <p>(Code error correction capability e = ${defaultCorrectionRadius})</p>
        `;
    } else {
        let theoreticalBallSize = 0;
        const n = globalAllWords[0]?.length;
        if (n && defaultCorrectionRadius >= 0) {
            theoreticalBallSize = 1;
            function combinations(n_len, k_len) {
                if (k_len < 0 || k_len > n_len) return 0;
                if (k_len === 0 || k_len === n_len) return 1;
                if (k_len > n_len / 2) k_len = n_len - k_len;
                let res = 1;
                for (let i = 1; i <= k_len; i++) {
                    res = Math.round(res * (n_len - i + 1) / i);
                }
                return res;
            }
            for (let r = 1; r <= defaultCorrectionRadius; r++) {
                theoreticalBallSize += combinations(n, r);
            }
        }

        ham_ball_info.innerHTML = `
            <p>Showing all <strong>${globalCodewords.length}</strong> codewords (red nodes).</p>
            <p>Error correction capability (radius of Hamming balls): <strong>e = ${defaultCorrectionRadius}</strong>.</p>
            ${theoreticalBallSize > 0 ? `<p>Each ball B(c, ${defaultCorrectionRadius}) contains approximately ${theoreticalBallSize.toLocaleString()} words.</p>` : ''}
            <p>Blue nodes are words within distance 'e' of a codeword.</p>
        `;
    }
}

reset_btn.addEventListener('click', () => {
    selectedCodeword = null;
    displayNetwork(globalCodewords, globalAllWords);
});

apply_radbtn.addEventListener('click', () => {
    if (!selectedCodeword) return;

    const selectedRadius = parseInt(rad_dropdown.value, 10);

    const n = globalAllWords[0]?.length || 0;
    if (!isNaN(selectedRadius) && selectedRadius >= 1 && selectedRadius <= n) {
        displayNetwork(globalCodewords, globalAllWords, selectedCodeword, selectedRadius);
    } else {
        console.warn("Invalid radius selected:", selectedRadius);
    }
});

function forceAtlas2Layout(graph, iterations) {
    const positions = {};
    const nodes = graph.nodes();

    if (!nodes || nodes.length === 0) {
        return positions;
    }

    nodes.forEach(node => {
        positions[node] = {
            x: Math.random() * 10 - 5,
            y: Math.random() * 10 - 5
        };
    });

    const kr = 1;
    const ks = 0.1;
    const dt = 0.1;
    const gravity = 0.05;
    const barnesHutOptimize = false;
    const strongGravityMode = false;

    for (let iter = 0; iter < iterations; iter++) {
        const forces = {};
        nodes.forEach(node => {
            forces[node] = { x: 0, y: 0 };
        });

        for (let i = 0; i < nodes.length; i++) {
            for (let j = i + 1; j < nodes.length; j++) {
                const node1 = nodes[i];
                const node2 = nodes[j];

                const dx = positions[node2].x - positions[node1].x;
                const dy = positions[node2].y - positions[node1].y;
                const distanceSquared = dx * dx + dy * dy;
                const distance = Math.sqrt(distanceSquared) + 0.001;

                const repulsionForce = kr / distance;

                const fx = dx / distance * repulsionForce;
                const fy = dy / distance * repulsionForce;

                forces[node1].x -= fx;
                forces[node1].y -= fy;
                forces[node2].x += fx;
                forces[node2].y += fy;
            }
        }

        graph.forEachEdge((edge, attributes, source, target) => {
            if (positions[source] && positions[target]) {
                const dx = positions[target].x - positions[source].x;
                const dy = positions[target].y - positions[source].y;
                const distance = Math.sqrt(dx * dx + dy * dy) + 0.001;

                const attractionForce = ks * distance;
                const fx = dx / distance * attractionForce;
                const fy = dy / distance * attractionForce;

                forces[source].x += fx;
                forces[source].y += fy;
                forces[target].x -= fx;
                forces[target].y -= fy;
            }
        });

        nodes.forEach(node => {
            const distFromCenter = Math.sqrt(positions[node].x * positions[node].x + positions[node].y * positions[node].y) + 0.001;
            const gravityForce = gravity * distFromCenter;
            forces[node].x -= (positions[node].x / distFromCenter) * gravityForce;
            forces[node].y -= (positions[node].y / distFromCenter) * gravityForce;
        });

        nodes.forEach(node => {
            const displacementX = forces[node].x * dt;
            const displacementY = forces[node].y * dt;

            positions[node].x += displacementX;
            positions[node].y += displacementY;
        });
    }

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    nodes.forEach(node => {
        minX = Math.min(minX, positions[node].x);
        maxX = Math.max(maxX, positions[node].x);
        minY = Math.min(minY, positions[node].y);
        maxY = Math.max(maxY, positions[node].y);
    });

    const width = maxX - minX;
    const height = maxY - minY;
    const graphRatio = width / height;
    const viewRatio = 1;

    let scale;
    if (width === 0 || height === 0) {
        scale = 1;
    } else {
        scale = 10 / Math.max(width, height);
    }

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    nodes.forEach(node => {
        positions[node].x = (positions[node].x - centerX) * scale;
        positions[node].y = (positions[node].y - centerY) * scale;
    });

    return positions;
}