/**
 * ============================================================================
 * SMART DATA MATCH ANALYZER - MAIN APPLICATION LOGIC (script.js)
 * ============================================================================
 * Handles state management, UI interactions, Drag & Drop uploads, processing pipeline,
 * matching algorithm (Exact, Partial, Duplicate, Unique), search, filter, sort, and dark mode.
 */

// Global Application State
const AppState = {
    uploadedFiles: [], // Array of File objects
    extractedRecords: [], // Array of all raw parsed records
    results: {
        exact: [],
        partial: [],
        duplicates: [],
        unique: []
    },
    activeTab: 'exact',
    searchQuery: '',
    filterSource: 'all',
    sortBy: 'score_desc',
    isProcessing: false,
    theme: localStorage.getItem('theme') || 'light'
};

// Initialize Application on DOM Content Loaded
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    setupEventListeners();
    renderDashboard();
});

// ============================================================================
// 1. EVENT LISTENERS & UI SETUP
// ============================================================================

function setupEventListeners() {
    // Theme Toggle
    const themeBtn = document.getElementById('themeToggleBtn');
    if (themeBtn) {
        themeBtn.addEventListener('click', toggleTheme);
    }

    // Drag and Drop Zone
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');

    if (dropZone && fileInput) {
        dropZone.addEventListener('click', () => fileInput.click());

        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('drag-over');
        });

        dropZone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                handleFilesAdded(Array.from(e.dataTransfer.files));
            }
        });

        fileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files.length > 0) {
                handleFilesAdded(Array.from(e.target.files));
                fileInput.value = ''; // Reset input for re-uploading same file if needed
            }
        });
    }

    // Action Buttons
    const runBtn = document.getElementById('runAnalyzerBtn');
    const clearBtn = document.getElementById('clearAllBtn');
    const sampleBtn = document.getElementById('loadSampleBtn');

    if (runBtn) runBtn.addEventListener('click', startAnalysisPipeline);
    if (clearBtn) clearBtn.addEventListener('click', clearAllData);
    if (sampleBtn) sampleBtn.addEventListener('click', loadSampleTestData);

    // Tab Switching
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            tabBtns.forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            AppState.activeTab = e.currentTarget.dataset.tab;
            renderActiveTable();
        });
    });

    // Search & Filter Controls
    const searchInput = document.getElementById('searchInput');
    const filterSelect = document.getElementById('sourceFilterSelect');
    const sortSelect = document.getElementById('sortSelect');

    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            AppState.searchQuery = e.target.value.trim().toLowerCase();
            renderActiveTable();
        });
    }

    if (filterSelect) {
        filterSelect.addEventListener('change', (e) => {
            AppState.filterSource = e.target.value;
            renderActiveTable();
        });
    }

    if (sortSelect) {
        sortSelect.addEventListener('change', (e) => {
            AppState.sortBy = e.target.value;
            renderActiveTable();
        });
    }

    // Export Buttons
    const exportExcelBtn = document.getElementById('exportExcelBtn');
    const exportPdfBtn = document.getElementById('exportPdfBtn');

    if (exportExcelBtn) {
        exportExcelBtn.addEventListener('click', () => {
            const allMatched = [
                ...AppState.results.exact,
                ...AppState.results.partial,
                ...AppState.results.duplicates,
                ...AppState.results.unique
            ];
            exportToExcel(allMatched, `SmartMatch_Results_${Date.now()}.xlsx`);
        });
    }

    if (exportPdfBtn) {
        exportPdfBtn.addEventListener('click', () => {
            const allMatched = [
                ...AppState.results.exact,
                ...AppState.results.partial,
                ...AppState.results.duplicates,
                ...AppState.results.unique
            ];
            exportToPDFReport(allMatched, 'Smart Data Match Analyzer Report', `SmartMatch_Report_${Date.now()}.pdf`);
        });
    }
}

// ============================================================================
// 2. THEME MANAGEMENT
// ============================================================================

function initTheme() {
    document.documentElement.setAttribute('data-theme', AppState.theme);
    updateThemeIcon();
}

function toggleTheme() {
    AppState.theme = AppState.theme === 'light' ? 'dark' : 'light';
    localStorage.setItem('theme', AppState.theme);
    document.documentElement.setAttribute('data-theme', AppState.theme);
    updateThemeIcon();
}

function updateThemeIcon() {
    const icon = document.querySelector('#themeToggleBtn i');
    if (icon) {
        icon.className = AppState.theme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
    }
}

// ============================================================================
// 3. FILE MANAGEMENT
// ============================================================================

function handleFilesAdded(newFiles) {
    const validExtensions = ['pdf', 'xlsx', 'xls', 'csv'];
    let addedCount = 0;

    newFiles.forEach(file => {
        const ext = file.name.split('.').pop().toLowerCase();
        if (validExtensions.includes(ext)) {
            // Check if file already uploaded
            if (!AppState.uploadedFiles.some(f => f.name === file.name && f.size === file.size)) {
                AppState.uploadedFiles.push(file);
                addedCount++;
            }
        } else {
            alert(`Unsupported file format: "${file.name}". Please upload .pdf, .xlsx, .xls, or .csv files.`);
        }
    });

    if (addedCount > 0) {
        renderFileList();
        updateSourceFilterOptions();
        updateRunButtonState();
    }
}

function removeFile(index) {
    AppState.uploadedFiles.splice(index, 1);
    renderFileList();
    updateSourceFilterOptions();
    updateRunButtonState();
}

function renderFileList() {
    const container = document.getElementById('fileListContainer');
    const badgeCount = document.getElementById('uploadedFileCountBadge');

    if (badgeCount) badgeCount.textContent = AppState.uploadedFiles.length;
    if (!container) return;

    if (AppState.uploadedFiles.length === 0) {
        container.innerHTML = `<div class="empty-file-list"><i class="fas fa-folder-open"></i><p>No files uploaded yet. Drag & drop above or load sample test data.</p></div>`;
        return;
    }

    container.innerHTML = AppState.uploadedFiles.map((file, idx) => {
        const ext = file.name.split('.').pop().toLowerCase();
        let iconClass = 'fa-file-alt';
        let badgeColor = 'bg-gray';

        if (ext === 'pdf') { iconClass = 'fa-file-pdf'; badgeColor = 'bg-red'; }
        else if (['xlsx', 'xls'].includes(ext)) { iconClass = 'fa-file-excel'; badgeColor = 'bg-green'; }
        else if (ext === 'csv') { iconClass = 'fa-file-csv'; badgeColor = 'bg-blue'; }

        const sizeKb = (file.size / 1024).toFixed(1);

        return `
            <div class="file-item card-hover">
                <div class="file-info">
                    <div class="file-icon ${badgeColor}"><i class="fas ${iconClass}"></i></div>
                    <div class="file-details">
                        <div class="file-name" title="${file.name}">${file.name}</div>
                        <div class="file-meta">${ext.toUpperCase()} • ${sizeKb} KB</div>
                    </div>
                </div>
                <button class="remove-file-btn" onclick="removeFile(${idx})" title="Remove File">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
    }).join('');
}

function updateRunButtonState() {
    const runBtn = document.getElementById('runAnalyzerBtn');
    if (runBtn) {
        runBtn.disabled = AppState.uploadedFiles.length === 0 || AppState.isProcessing;
    }
}

function clearAllData() {
    if (AppState.uploadedFiles.length > 0 || AppState.extractedRecords.length > 0) {
        if (!confirm('Are you sure you want to clear all files and analysis results?')) return;
    }
    AppState.uploadedFiles = [];
    AppState.extractedRecords = [];
    AppState.results = { exact: [], partial: [], duplicates: [], unique: [] };
    AppState.searchQuery = '';
    AppState.filterSource = 'all';

    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.value = '';

    renderFileList();
    updateSourceFilterOptions();
    updateRunButtonState();
    renderDashboard();
    renderActiveTable();
}

// ============================================================================
// 4. SAMPLE TEST DATA LOADER
// ============================================================================

/**
 * Creates virtual sample Blob files to demonstrate multi-file matching instantly.
 */
function loadSampleTestData() {
    const sampleExcelData1 = [
        { 'Candidate Name': 'Rohan Kumar', 'Father Name': 'Suresh Kumar', 'Mobile': '9876543210', 'Address': 'Patna, Bihar' },
        { 'Candidate Name': 'Mohd Arman', 'Father Name': 'Abdul Rahim', 'Mobile': '9123456789', 'Address': 'Lucknow, UP' },
        { 'Candidate Name': 'Priya Sharma', 'Father Name': 'Rajesh Sharma', 'Mobile': '9988776655', 'Address': 'Delhi' },
        { 'Candidate Name': 'Amit Prasad Ji', 'Father Name': 'Brijesh Prasad', 'Mobile': '9456123789', 'Address': 'Ranchi' },
        { 'Candidate Name': 'Rohan Kumar', 'Father Name': 'Suresh Kumar', 'Mobile': '9876543210', 'Address': 'Patna, Bihar' } // Duplicate in File 1
    ];

    const sampleExcelData2 = [
        { 'Full Name': 'Rohan Kr', 'Guardian Name': 'Suresh Kumar', 'Contact': '9876543210', 'City': 'Patna' }, // Partial match with Rohan Kumar
        { 'Full Name': 'Mohammad Arman', 'Guardian Name': 'Abdul Rahim', 'Contact': '9123456789', 'City': 'Lucknow' }, // Exact/Abbrev match with Mohd Arman
        { 'Full Name': 'Vikram Singh', 'Guardian Name': 'Mahendra Singh', 'Contact': '9001122334', 'City': 'Jaipur' }, // Unique record
        { 'Full Name': 'Amit Prasad', 'Guardian Name': 'Brijesh Prasad', 'Contact': '9456123789', 'City': 'Ranchi' } // Exact match after normalize
    ];

    // Convert to worksheets and virtual files
    const wb1 = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb1, XLSX.utils.json_to_sheet(sampleExcelData1), 'Sheet1');
    const wb1Buffer = XLSX.write(wb1, { bookType: 'xlsx', type: 'array' });
    const file1 = new File([wb1Buffer], 'Applicant_List_Bihar.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    const wb2 = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb2, XLSX.utils.json_to_sheet(sampleExcelData2), 'Sheet1');
    const wb2Buffer = XLSX.write(wb2, { bookType: 'xlsx', type: 'array' });
    const file2 = new File([wb2Buffer], 'Candidate_Master_National.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    handleFilesAdded([file1, file2]);
    startAnalysisPipeline();
}

// ============================================================================
// 5. DATA EXTRACTION & MATCHING PIPELINE
// ============================================================================

async function startAnalysisPipeline() {
    if (AppState.uploadedFiles.length === 0) return;

    AppState.isProcessing = true;
    updateRunButtonState();
    showProgressModal(true);

    try {
        AppState.extractedRecords = [];
        const totalFiles = AppState.uploadedFiles.length;

        // Step 1: Parse all files
        for (let i = 0; i < totalFiles; i++) {
            const file = AppState.uploadedFiles[i];
            updateProgressModal(Math.round(((i) / totalFiles) * 40), `Parsing file (${i + 1}/${totalFiles}): ${file.name}...`);

            const ext = file.name.split('.').pop().toLowerCase();
            let records = [];

            if (['xlsx', 'xls', 'csv'].includes(ext)) {
                records = await parseExcelOrCSV(file);
            } else if (ext === 'pdf') {
                const pdfParsedRecords = await parsePDF(file, (msg) => {
                    updateProgressModal(Math.round(((i) / totalFiles) * 40) + 5, msg);
                });
                updateProgressModal(Math.round(((i) / totalFiles) * 40) + 8, `Converting PDF "${file.name}" into structured Excel sheet...`);
                await sleep(200);
                const convertedExcelFile = await convertPDFToExcelFile(pdfParsedRecords, file.name);
                updateProgressModal(Math.round(((i) / totalFiles) * 40) + 10, `Reading records from converted Excel file...`);
                records = await parseExcelOrCSV(convertedExcelFile);
            }

            AppState.extractedRecords.push(...records);
        }

        updateProgressModal(50, `Extracted ${AppState.extractedRecords.length} records. Cleaning & Normalizing data...`);
        await sleep(300);

        // Step 2: Run Matching Engine
        updateProgressModal(70, `Executing Fuzzy Matching AI & Duplicate Detection...`);
        await sleep(300);

        executeMatchingEngine(AppState.extractedRecords);

        updateProgressModal(100, `Analysis Complete! Generating result dashboards...`);
        await sleep(400);

        showProgressModal(false);
        renderDashboard();
        renderActiveTable();
    } catch (error) {
        console.error("Pipeline Error:", error);
        alert(`An error occurred during processing: ${error.message}`);
        showProgressModal(false);
    } finally {
        AppState.isProcessing = false;
        updateRunButtonState();
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// 6. MATCHING LOGIC & CLASSIFICATION ENGINE
// ============================================================================

function executeMatchingEngine(allRecords) {
    const exactMatches = [];
    const partialMatches = [];
    const duplicates = [];
    const uniqueRecords = [];

    const processedIds = new Set();

    // Step A: Detect within-file DUPLICATES first
    // Same record repeated in same file
    for (let i = 0; i < allRecords.length; i++) {
        const recA = allRecords[i];
        if (processedIds.has(recA.id)) continue;

        let isDuplicate = false;
        for (let j = i + 1; j < allRecords.length; j++) {
            const recB = allRecords[j];
            if (processedIds.has(recB.id)) continue;

            // Check if from same file
            if (recA.sourceFile === recB.sourceFile) {
                const nameSim = calculateSimilarity(recA.normName, recB.normName);
                const fatherSim = calculateSimilarity(recA.normFatherName, recB.normFatherName);

                if (nameSim >= 95 && fatherSim >= 95) {
                    // Mark recB as duplicate
                    duplicates.push({
                        ...recB,
                        status: 'DUPLICATE',
                        score: Math.round((nameSim + fatherSim) / 2)
                    });
                    processedIds.add(recB.id);
                    isDuplicate = true;
                }
            }
        }
    }

    // Step B: Compare remaining records across files (or within remaining pool)
    const remainingRecords = allRecords.filter(r => !processedIds.has(r.id));
    const matchedInStepB = new Set();

    for (let i = 0; i < remainingRecords.length; i++) {
        const recA = remainingRecords[i];
        if (matchedInStepB.has(recA.id)) continue;

        let bestMatch = null;
        let bestScore = 0;
        let bestType = null; // 'EXACT' or 'PARTIAL'

        for (let j = i + 1; j < remainingRecords.length; j++) {
            const recB = remainingRecords[j];
            if (matchedInStepB.has(recB.id)) continue;

            const nameSim = calculateSimilarity(recA.normName, recB.normName);
            const fatherSim = calculateSimilarity(recA.normFatherName, recB.normFatherName);
            const overallScore = Math.round((nameSim + fatherSim) / 2);

            // Rule 1: Exact Match (Name AND Father Name both same / score 95-100)
            if (nameSim >= 95 && fatherSim >= 95) {
                if (overallScore > bestScore) {
                    bestScore = overallScore;
                    bestMatch = recB;
                    bestType = 'EXACT';
                }
            }
            // Rule 2: Partial Match (Name same but Father Name slightly diff OR vice versa / score 80-94)
            else if (
                (nameSim >= 95 && fatherSim >= 75) ||
                (nameSim >= 75 && fatherSim >= 95) ||
                (overallScore >= 80 && overallScore < 95)
            ) {
                if (overallScore > bestScore && bestType !== 'EXACT') {
                    bestScore = overallScore;
                    bestMatch = recB;
                    bestType = 'PARTIAL';
                }
            }
        }

        if (bestMatch) {
            matchedInStepB.add(recA.id);
            matchedInStepB.add(bestMatch.id);

            const sourceFilesList = Array.from(new Set([recA.sourceFile, bestMatch.sourceFile]));

            const combinedRecord = {
                id: `${recA.id}_${bestMatch.id}`,
                name: recA.rawName.length >= bestMatch.rawName.length ? recA.rawName : bestMatch.rawName,
                fatherName: recA.rawFatherName.length >= bestMatch.rawFatherName.length ? recA.rawFatherName : bestMatch.rawFatherName,
                rawName: `${recA.rawName} ≈ ${bestMatch.rawName}`,
                rawFatherName: `${recA.rawFatherName} ≈ ${bestMatch.rawFatherName}`,
                normName: recA.normName,
                normFatherName: recA.normFatherName,
                score: bestScore,
                sourceFiles: sourceFilesList,
                sourceFile: sourceFilesList.join(', '),
                mobile: recA.mobile || bestMatch.mobile || 'N/A',
                address: recA.address || bestMatch.address || 'N/A'
            };

            if (bestType === 'EXACT') {
                combinedRecord.status = 'EXACT MATCH';
                exactMatches.push(combinedRecord);
            } else {
                combinedRecord.status = 'PARTIAL MATCH';
                partialMatches.push(combinedRecord);
            }
        } else {
            // Rule 4: Unique Record
            matchedInStepB.add(recA.id);
            uniqueRecords.push({
                ...recA,
                name: recA.rawName,
                fatherName: recA.rawFatherName,
                status: 'UNIQUE',
                score: 0,
                sourceFiles: [recA.sourceFile]
            });
        }
    }

    AppState.results = {
        exact: exactMatches,
        partial: partialMatches,
        duplicates: duplicates,
        unique: uniqueRecords
    };
}

// ============================================================================
// 7. DASHBOARD & UI RENDERING
// ============================================================================

function renderDashboard() {
    document.getElementById('kpiTotalFiles').textContent = AppState.uploadedFiles.length;
    document.getElementById('kpiTotalRecords').textContent = AppState.extractedRecords.length;
    document.getElementById('kpiExactMatches').textContent = AppState.results.exact.length;
    document.getElementById('kpiPartialMatches').textContent = AppState.results.partial.length;
    document.getElementById('kpiDuplicates').textContent = AppState.results.duplicates.length;
    document.getElementById('kpiUnique').textContent = AppState.results.unique.length;

    // Update tab count badges
    document.getElementById('badgeExact').textContent = AppState.results.exact.length;
    document.getElementById('badgePartial').textContent = AppState.results.partial.length;
    document.getElementById('badgeDuplicates').textContent = AppState.results.duplicates.length;
    document.getElementById('badgeUnique').textContent = AppState.results.unique.length;
}

function updateSourceFilterOptions() {
    const select = document.getElementById('sourceFilterSelect');
    if (!select) return;

    const currentVal = select.value;
    const fileNames = AppState.uploadedFiles.map(f => f.name);

    let html = `<option value="all">All Source Files</option>`;
    fileNames.forEach(name => {
        html += `<option value="${name}">${name}</option>`;
    });

    select.innerHTML = html;
    if (fileNames.includes(currentVal)) {
        select.value = currentVal;
    }
}

function renderActiveTable() {
    const tableBody = document.getElementById('resultsTableBody');
    const tableHeader = document.getElementById('resultsTableHeader');
    if (!tableBody || !tableHeader) return;

    const activeList = AppState.results[AppState.activeTab] || [];

    // Filter by search query
    let filtered = activeList.filter(item => {
        if (!AppState.searchQuery) return true;
        const query = AppState.searchQuery;
        const nameMatch = (item.rawName || item.name || '').toLowerCase().includes(query);
        const fatherMatch = (item.rawFatherName || item.fatherName || '').toLowerCase().includes(query);
        const fileMatch = (item.sourceFile || '').toLowerCase().includes(query);
        return nameMatch || fatherMatch || fileMatch;
    });

    // Filter by source file
    if (AppState.filterSource !== 'all') {
        filtered = filtered.filter(item => {
            if (Array.isArray(item.sourceFiles)) {
                return item.sourceFiles.includes(AppState.filterSource);
            }
            return item.sourceFile === AppState.filterSource;
        });
    }

    // Sort items
    filtered.sort((a, b) => {
        if (AppState.sortBy === 'score_desc') return (b.score || 0) - (a.score || 0);
        if (AppState.sortBy === 'score_asc') return (a.score || 0) - (b.score || 0);
        if (AppState.sortBy === 'name_asc') return (a.name || a.rawName || '').localeCompare(b.name || b.rawName || '');
        if (AppState.sortBy === 'name_desc') return (b.name || b.rawName || '').localeCompare(a.name || a.rawName || '');
        return 0;
    });

    // Configure Headers based on Tab
    if (['exact', 'partial'].includes(AppState.activeTab)) {
        tableHeader.innerHTML = `
            <tr>
                <th>Person Name</th>
                <th>Father / Guardian Name</th>
                <th class="text-center">Match Score</th>
                <th>Source Files</th>
                <th class="text-center">Status</th>
            </tr>
        `;
    } else {
        // Duplicates and Unique table
        tableHeader.innerHTML = `
            <tr>
                <th>Person Name</th>
                <th>Father / Guardian Name</th>
                <th>Source File</th>
                <th>Mobile / Contact</th>
                <th class="text-center">Status</th>
            </tr>
        `;
    }

    // Render Rows
    if (filtered.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center no-results-cell">
                    <div class="empty-state">
                        <i class="fas fa-search"></i>
                        <p>No matching records found in this category.</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    tableBody.innerHTML = filtered.map(item => {
        const nameStr = item.rawName || item.name || 'N/A';
        const fatherStr = item.rawFatherName || item.fatherName || 'N/A';
        const filesStr = Array.isArray(item.sourceFiles)
            ? item.sourceFiles.map(f => `<span class="file-tag"><i class="fas fa-file"></i> ${f}</span>`).join(' ')
            : `<span class="file-tag"><i class="fas fa-file"></i> ${item.sourceFile || 'N/A'}</span>`;

        let statusBadgeClass = 'badge-unique';
        if (item.status === 'EXACT MATCH') statusBadgeClass = 'badge-exact';
        else if (item.status === 'PARTIAL MATCH') statusBadgeClass = 'badge-partial';
        else if (item.status === 'DUPLICATE') statusBadgeClass = 'badge-duplicate';

        if (['exact', 'partial'].includes(AppState.activeTab)) {
            const scoreVal = item.score !== undefined ? item.score : 0;
            let scoreColor = '#10b981'; // green
            if (scoreVal < 95) scoreColor = '#f59e0b'; // orange
            if (scoreVal < 80) scoreColor = '#64748b'; // gray

            return `
                <tr class="table-row-hover">
                    <td class="font-medium text-main">${nameStr}</td>
                    <td class="text-secondary">${fatherStr}</td>
                    <td class="text-center">
                        <div class="score-pill" style="border-color: ${scoreColor}; color: ${scoreColor}">
                            <i class="fas fa-chart-line"></i> ${scoreVal}%
                        </div>
                    </td>
                    <td><div class="files-list">${filesStr}</div></td>
                    <td class="text-center"><span class="status-badge ${statusBadgeClass}">${item.status}</span></td>
                </tr>
            `;
        } else {
            return `
                <tr class="table-row-hover">
                    <td class="font-medium text-main">${nameStr}</td>
                    <td class="text-secondary">${fatherStr}</td>
                    <td><div class="files-list">${filesStr}</div></td>
                    <td class="text-secondary">${item.mobile || 'N/A'}</td>
                    <td class="text-center"><span class="status-badge ${statusBadgeClass}">${item.status}</span></td>
                </tr>
            `;
        }
    }).join('');
}

// ============================================================================
// 8. PROGRESS MODAL CONTROLS
// ============================================================================

function showProgressModal(show) {
    const modal = document.getElementById('progressModal');
    if (!modal) return;
    if (show) {
        modal.classList.remove('hidden');
    } else {
        modal.classList.add('hidden');
    }
}

function updateProgressModal(percentage, text) {
    const bar = document.getElementById('progressBarFill');
    const label = document.getElementById('progressPercentage');
    const msg = document.getElementById('progressStatusText');

    if (bar) bar.style.width = `${percentage}%`;
    if (label) label.textContent = `${percentage}%`;
    if (msg) msg.textContent = text;
}
