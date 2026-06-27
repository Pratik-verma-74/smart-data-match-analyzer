/**
 * ============================================================================
 * SMART DATA MATCH ANALYZER - UTILITIES & CORE ALGORITHMS (utils.js)
 * ============================================================================
 * Modular utilities for data normalization, fuzzy matching, file parsing (Excel, CSV, PDF + OCR),
 * auto-column mapping, and export functionalities.
 */

// ============================================================================
// 1. DATA CLEANING & NORMALIZATION
// ============================================================================

/**
 * Normalizes text by converting to lowercase, removing extra spaces,
 * stripping special characters, and expanding known Indian/global abbreviations.
 * @param {string} text - Raw input string
 * @returns {string} - Cleaned and normalized string
 */
function normalizeText(text) {
    if (!text || typeof text !== 'string') return '';
    
    let clean = text.trim().toLowerCase();
    
    // Replace common punctuation with space
    clean = clean.replace(/[\.\,\-\_\/\(\)\\\:\;\"\'\`\~]/g, ' ');
    
    // Normalize common abbreviations (Word boundary matching)
    const abbreviations = {
        '\\bmd\\b': 'mohammad',
        '\\bmohd\\b': 'mohammad',
        '\\bmhd\\b': 'mohammad',
        '\\bsh\\b': 'shri',
        '\\bshri\\b': 'shri',
        '\\bsmt\\b': 'shrimati',
        '\\bkr\\b': 'kumar',
        '\\bkm\\b': 'kumari',
        '\\bprasad ji\\b': 'prasad',
        '\\bji\\b': '', // Remove honorific 'ji' at word boundaries
        '\\bsy\\b': 'syed',
        '\\bsyd\\b': 'syed',
        '\\bdr\\b': 'doctor',
        '\\ber\\b': 'engineer'
    };
    
    for (const [pattern, replacement] of Object.entries(abbreviations)) {
        const regex = new RegExp(pattern, 'gi');
        clean = clean.replace(regex, replacement);
    }
    
    // Remove remaining non-alphanumeric characters except spaces
    clean = clean.replace(/[^a-z0-9\s]/g, '');
    
    // Collapse multiple consecutive spaces into a single space and trim
    return clean.replace(/\s+/g, ' ').trim();
}

/**
 * Cleans phone numbers by keeping only digits.
 * @param {string|number} mobile - Raw mobile input
 * @returns {string} - Clean 10-15 digit mobile string
 */
function normalizeMobile(mobile) {
    if (!mobile) return '';
    return String(mobile).replace(/[^0-9]/g, '');
}

// ============================================================================
// 2. FUZZY MATCHING ALGORITHMS
// ============================================================================

/**
 * Calculates Levenshtein distance between two strings.
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {number} - Edit distance
 */
function levenshteinDistance(a, b) {
    const matrix = [];
    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // substitution
                    Math.min(matrix[i][j - 1] + 1, // insertion
                             matrix[i - 1][j] + 1) // deletion
                );
            }
        }
    }
    return matrix[b.length][a.length];
}

/**
 * Calculates similarity score (0 to 100) between two normalized strings.
 * Uses a hybrid approach: Dice Coefficient + Levenshtein ratio for high precision.
 * @param {string} str1 - First normalized string
 * @param {string} str2 - Second normalized string
 * @returns {number} - Similarity percentage (0-100)
 */
function calculateSimilarity(str1, str2) {
    if (!str1 && !str2) return 100;
    if (!str1 || !str2) return 0;
    if (str1 === str2) return 100;
    
    const len1 = str1.length;
    const len2 = str2.length;
    const maxLen = Math.max(len1, len2);
    if (maxLen === 0) return 100;
    
    // Levenshtein ratio
    const distance = levenshteinDistance(str1, str2);
    const levRatio = (1 - distance / maxLen) * 100;
    
    // Jaccard / Token overlap bonus for reordered words (e.g. "Rohan Kumar" vs "Kumar Rohan")
    const words1 = new Set(str1.split(' '));
    const words2 = new Set(str2.split(' '));
    let intersection = 0;
    words1.forEach(w => {
        if (words2.has(w)) intersection++;
    });
    const union = new Set([...words1, ...words2]).size;
    const tokenRatio = union > 0 ? (intersection / union) * 100 : 0;
    
    // Weighted hybrid score prioritizing character accuracy but rewarding word matches
    const score = Math.round((levRatio * 0.65) + (tokenRatio * 0.35));
    return Math.min(100, Math.max(0, score));
}

// ============================================================================
// 3. AI / AUTOMATIC COLUMN MAPPING
// ============================================================================

/**
 * Automatically maps varying table header names to standard fields.
 * Standard Fields: name, fatherName, address, mobile, dob
 * @param {Array<string>} headers - Raw header names extracted from file
 * @returns {Object} - Mapping object { standardField: rawHeaderName }
 */
function autoMapColumns(headers) {
    const mapping = {
        formNumber: null,
        name: null,
        fatherName: null,
        programme: null,
        score: null,
        address: null,
        mobile: null,
        dob: null
    };
    
    const patterns = {
        formNumber: [/form.*num/i, /app.*num/i, /reg.*num/i, /roll.*num/i, /^id$/i, /application.*no/i],
        fatherName: [/name.*of.*father/i, /father.*name/i, /father/i, /guardian/i, /pitaji/i, /f_name/i, /parent/i],
        name: [/name.*of.*the.*applicant/i, /name.*of.*applicant/i, /candidate.*name/i, /full.*name/i, /student.*name/i, /person.*name/i, /applicant.*name/i, /^name$/i, /emp.*name/i, /member.*name/i],
        programme: [/programme/i, /course/i, /branch/i, /dept/i, /department/i],
        score: [/score/i, /mark/i, /rank/i, /merit/i, /percent/i, /cgpa/i],
        mobile: [/mobile/i, /phone/i, /contact/i, /cell/i, /whatsapp/i, /tel/i],
        dob: [/dob/i, /birth/i, /age/i, /date.*of.*birth/i],
        address: [/address/i, /city/i, /location/i, /residence/i, /pincode/i, /district/i, /state/i]
    };
    
    const assignedHeaders = new Set();
    
    for (const field of ['formNumber', 'fatherName', 'name', 'programme', 'score', 'mobile', 'dob', 'address']) {
        for (const header of headers) {
            if (assignedHeaders.has(header)) continue;
            if (patterns[field].some(p => p.test(header))) {
                mapping[field] = header;
                assignedHeaders.add(header);
                break;
            }
        }
    }
    
    // Fallback for name if generic "Name" wasn't caught
    if (!mapping.name) {
        for (const header of headers) {
            if (assignedHeaders.has(header)) continue;
            if (/name/i.test(header)) {
                mapping.name = header;
                assignedHeaders.add(header);
                break;
            }
        }
    }
    
    return mapping;
}

// ============================================================================
// 4. FILE PARSERS (EXCEL, CSV, PDF + OCR)
// ============================================================================

/**
 * Parses an Excel or CSV file using SheetJS (XLSX).
 * @param {File} file - Uploaded File object
 * @returns {Promise<Array<Object>>} - Array of normalized record objects
 */
async function parseExcelOrCSV(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                
                // Convert sheet to JSON array with header row
                const rawRows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
                if (rawRows.length === 0) {
                    resolve([]);
                    return;
                }
                
                // Extract headers from first row keys
                const headers = Object.keys(rawRows[0]);
                const colMap = autoMapColumns(headers);
                
                const records = rawRows.map((row, index) => {
                    const rawName = String(row[colMap.name] || '').trim();
                    const rawFather = String(row[colMap.fatherName] || '').trim();
                    const formNum = String(row[colMap.formNumber] || '').trim();
                    
                    if (!rawName && !rawFather && !formNum) return null;
                    
                    // Filter out noise / document instructions / headers
                    const isNoise = /(?:provisional|admission|academic|session|candidate.*must|bring.*all|necessary|document|certificate|copy.*of|class.*10th|12th|cuet|igntu|registration.*form|score.*card|merit.*list|department|university|instructions|signature|controller|examination|notice|date|page\s*\d|s\.?no|form.*no|name.*of.*applicant|programme.*name)/i.test(rawName + ' ' + rawFather) ||
                                    rawName.length > 35 || rawFather.length > 35 ||
                                    /\d/.test(rawName);
                    if (isNoise && !formNum) return null;
                    
                    return {
                        id: `${file.name}_row_${index + 1}`,
                        sourceFile: file.name,
                        fileType: file.name.split('.').pop().toUpperCase(),
                        formNumber: formNum,
                        programme: String(row[colMap.programme] || '').trim(),
                        scoreValue: String(row[colMap.score] || '').trim(),
                        rawName: rawName || 'N/A',
                        rawFatherName: rawFather || 'N/A',
                        normName: normalizeText(rawName),
                        normFatherName: normalizeText(rawFather),
                        address: String(row[colMap.address] || '').trim(),
                        mobile: normalizeMobile(row[colMap.mobile] || ''),
                        dob: String(row[colMap.dob] || '').trim(),
                        originalRowData: row
                    };
                }).filter(Boolean);
                
                resolve(records);
            } catch (err) {
                reject(new Error(`Failed to parse Excel/CSV file "${file.name}": ${err.message}`));
            }
        };
        reader.onerror = () => reject(new Error(`File reading error for "${file.name}"`));
        reader.readAsArrayBuffer(file);
    });
}

/**
 * Parses a PDF file. Attempts text extraction via PDF.js first.
 * If text layer is missing or sparse (scanned document), falls back to Tesseract.js OCR.
 * @param {File} file - Uploaded PDF File object
 * @param {Function} progressCallback - Updates progress message
 * @returns {Promise<Array<Object>>} - Array of extracted records
 */
async function parsePDF(file, progressCallback = () => {}) {
    try {
        if (typeof pdfjsLib === 'undefined') {
            throw new Error("PDF parser library (PDF.js) failed to load from CDN. Please refresh the page.");
        }
        
        progressCallback(`Reading PDF: ${file.name}...`);
        const arrayBuffer = await file.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        if (uint8Array.length === 0) {
            throw new Error("The uploaded file is empty (0 bytes).");
        }
        
        const pdf = await pdfjsLib.getDocument({
            data: uint8Array,
            cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
            cMapPacked: true
        }).promise;
        const totalPages = pdf.numPages;
        
        let fullTextLines = [];
        let totalExtractedChars = 0;
        
        // Phase 1: Try Text Layer Extraction (Group items by Y coordinate to preserve table rows)
        for (let i = 1; i <= totalPages; i++) {
            progressCallback(`Parsing PDF text (Page ${i}/${totalPages})...`);
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            
            const items = textContent.items.filter(item => item && item.str && item.str.trim().length > 0);
            totalExtractedChars += items.reduce((acc, it) => acc + it.str.length, 0);
            
            // Group items into rows by Y coordinate tolerance (~3px)
            const rowsMap = new Map();
            items.forEach(item => {
                const y = item.transform ? Math.round(item.transform[5] / 4) * 4 : 0;
                if (!rowsMap.has(y)) rowsMap.set(y, []);
                rowsMap.get(y).push(item);
            });
            
            // Sort rows top-to-bottom (highest Y first in PDF coordinates)
            const sortedY = Array.from(rowsMap.keys()).sort((a, b) => b - a);
            sortedY.forEach(y => {
                const rowItems = rowsMap.get(y).sort((a, b) => (a.transform ? a.transform[4] : 0) - (b.transform ? b.transform[4] : 0));
                const lineStr = rowItems.map(it => it.str.trim()).join(' | ');
                if (lineStr.length > 2) {
                    fullTextLines.push(lineStr);
                }
            });
        }
        
        // Phase 2: OCR Fallback if scanned image-based PDF (low character density)
        if (totalExtractedChars < 30 * totalPages) {
            progressCallback(`Scanned PDF detected! Initializing OCR engine for ${file.name}...`);
            fullTextLines = []; // Clear noisy text
            
            for (let i = 1; i <= totalPages; i++) {
                progressCallback(`Running AI OCR on Page ${i}/${totalPages} (Please wait)...`);
                const page = await pdf.getPage(i);
                const viewport = page.getViewport({ scale: 2.0 });
                
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.height = viewport.height;
                canvas.width = viewport.width;
                
                await page.render({ canvasContext: context, viewport: viewport }).promise;
                
                if (typeof Tesseract !== 'undefined') {
                    const result = await Tesseract.recognize(canvas, 'eng');
                    const ocrText = result.data.text || '';
                    ocrText.split(/\r?\n/).forEach(line => {
                        const cleaned = line.trim();
                        if (cleaned.length > 2) fullTextLines.push(cleaned);
                    });
                }
            }
        }
        
        // Phase 3: Parse extracted text lines into structured person records
        progressCallback(`Structuring records from ${file.name}...`);
        let records = parseTextLinesToRecords(fullTextLines, file.name);
        
        // Universal Fallback: If heuristic parsing caught 0 records but lines exist, convert raw lines directly
        if (records.length === 0 && fullTextLines.length > 0) {
            fullTextLines.slice(0, 500).forEach((line, idx) => {
                if (/(?:provisional|admission|academic|session|candidate.*must|bring.*all|necessary|document|certificate|copy.*of|class.*10th|12th|cuet|igntu|registration.*form|score.*card|merit.*list|department|university|instructions|signature|controller|examination|notice|date|page\s*\d|s\.?no|form.*no|name.*of.*applicant|programme.*name)/i.test(line)) return;
                const words = line.split(/[\|\t]|\s{2,}/).map(w => w.trim()).filter(w => w.length > 1 && !/^\d+$/.test(w));
                if (words.length >= 2 && words[0].length <= 35 && words[1].length <= 35 && !/\d/.test(words[0])) {
                    records.push({
                        id: `${file.name}_fallback_${idx + 1}`,
                        sourceFile: file.name,
                        fileType: 'PDF',
                        formNumber: '',
                        programme: '',
                        scoreValue: '',
                        rawName: words[0],
                        rawFatherName: words[1],
                        normName: normalizeText(words[0]),
                        normFatherName: normalizeText(words[1]),
                        address: words[2] || '',
                        mobile: normalizeMobile(line),
                        dob: '',
                        originalRowData: { Name: words[0], 'Father Name': words[1] }
                    });
                }
            });
        }
        
        if (records.length === 0) {
            throw new Error(`Could not find valid text data inside "${file.name}". Ensure the file is not corrupted or password protected.`);
        }
        
        return records;
    } catch (err) {
        console.error("PDF Parse Error:", err);
        throw new Error(err.message || `Failed to parse PDF "${file.name}"`);
    }
}

/**
 * Heuristic parser to extract Person Name and Father Name from unstructured text lines or tables.
 * Handles patterns like "Name: Rohan Kumar Father: Suresh Kumar" or table row lines.
 * @param {Array<string>} lines - Text lines from PDF/OCR
 * @param {string} fileName - Source file name
 * @returns {Array<Object>}
 */
function parseTextLinesToRecords(lines, fileName) {
    const records = [];
    let recordIndex = 1;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        let formNumber = '';
        let programme = '';
        let scoreValue = '';
        let name = '';
        let fatherName = '';
        let mobile = '';
        
        // Check if line contains a Form Number / App ID like IGNTUPG0000455 or alphanumeric code
        const formMatch = line.match(/\b([A-Z]{2,10}\d{4,15})\b/i);
        if (formMatch) {
            formNumber = formMatch[1].toUpperCase();
        }
        
        // Check for score at the end of line
        const scoreMatch = line.match(/\b(\d{1,3}(?:\.\d{1,2})?)$/);
        if (scoreMatch && !/^\d{10}$/.test(scoreMatch[1])) {
            scoreValue = scoreMatch[1];
        }
        
        // Check for key-value labels in the same line or sequential lines
        const nameMatch = line.match(/(?:Name|Candidate|Applicant|Student)\s*[\:\-\=]\s*([A-Za-z\s]+?)(?=\s+(?:Father|S\/O|D\/O|DOB|Mobile)|$)/i);
        const fatherMatch = line.match(/(?:Father|Guardian|S\/O|D\/O|W\/O)\s*[\:\-\=]?\s*([A-Za-z\s]+)/i);
        const mobileMatch = line.match(/(?:Mobile|Phone|Contact)?\s*[\:\-\=]?\s*(\b[6-9]\d{9}\b)/);
        
        if (nameMatch && fatherMatch) {
            name = nameMatch[1].trim();
            fatherName = fatherMatch[1].trim();
            if (mobileMatch) mobile = mobileMatch[1];
        } else if (line.includes(' | ') || line.includes(' - ') || line.includes('/') || line.includes(',') || line.includes('\t') || /\s{2,}/.test(line)) {
            const parts = line.split(/[\|\t\/\,\-]|\s{2,}/).map(s => s.trim()).filter(Boolean);
            
            // If Form Number was found in parts
            const formIdx = parts.findIndex(p => p.toUpperCase() === formNumber || /^[A-Z]{2,10}\d{4,15}$/i.test(p));
            if (formIdx !== -1) {
                formNumber = parts[formIdx].toUpperCase();
                const afterParts = parts.slice(formIdx + 1).filter(p => !/^\d+$/.test(p) && p.length > 1);
                if (afterParts.length >= 3 && /(master|bachelor|m\.?a|b\.?a|m\.?sc|b\.?sc|m\.?com|b\.?com|m\.?tech|b\.?tech|pg|ug|diploma|app|comp|sci|eng)/i.test(afterParts[0])) {
                    programme = afterParts[0];
                    name = afterParts[1];
                    fatherName = afterParts[2];
                } else if (afterParts.length >= 2) {
                    name = afterParts[0];
                    fatherName = afterParts[1];
                    if (afterParts[2]) programme = afterParts[2];
                }
            } else {
                const textParts = parts.filter(p => !/^\d+$/.test(p) && p.length > 1 && !/^(male|female|gen|obc|sc|st|m|f|yes|no)$/i.test(p));
                if (textParts.length >= 2) {
                    name = textParts[0];
                    fatherName = textParts[1];
                }
            }
            
            const mobPart = parts.find(p => /\b[6-9]\d{9}\b/.test(p));
            if (mobPart) mobile = mobPart.match(/\b[6-9]\d{9}\b/)[0];
        }
        
        if (name && fatherName && name.length > 1 && fatherName.length > 1) {
            // Strict Noise Filter: Reject instruction sentences / document headers
            const isNoise = /(?:provisional|admission|academic|session|candidate.*must|bring.*all|necessary|document|certificate|copy.*of|class.*10th|12th|cuet|igntu|registration.*form|score.*card|merit.*list|department|university|instructions|signature|controller|examination|notice|date|page\s*\d|s\.?no|form.*no|name.*of.*applicant|programme.*name)/i.test(name + ' ' + fatherName) ||
                            name.length > 35 || fatherName.length > 35 ||
                            /\d/.test(name);
            if (isNoise && !formNumber) continue;

            records.push({
                id: `${fileName}_pdf_${recordIndex++}`,
                sourceFile: fileName,
                fileType: 'PDF',
                formNumber: formNumber,
                programme: programme,
                scoreValue: scoreValue,
                rawName: name,
                rawFatherName: fatherName,
                normName: normalizeText(name),
                normFatherName: normalizeText(fatherName),
                address: '',
                mobile: normalizeMobile(mobile),
                dob: '',
                originalRowData: { 'FORM NUMBER': formNumber, 'PROGRAMME NAME': programme, 'NAME OF THE APPLICANT': name, 'NAME OF FATHER': fatherName, 'SCORE': scoreValue }
            });
        }
    }
    
    return records;
}

// ============================================================================
// 5. DATA EXPORT FUNCTIONS
// ============================================================================

/**
 * Converts parsed PDF records into a structured Excel (.xlsx) file,
 * triggers an automatic download for the user, and returns the File object
 * so the matching engine processes it as a standard Excel file.
 * @param {Array<Object>} pdfRecords - Records parsed from PDF
 * @param {string} pdfFileName - Original PDF filename
 * @returns {Promise<File>} - Converted Excel File object
 */
async function convertPDFToExcelFile(pdfRecords, pdfFileName) {
    const sheetData = pdfRecords.map((r, idx) => ({
        'S.No': idx + 1,
        'FORM NUMBER': r.formNumber || 'N/A',
        'PROGRAMME NAME': r.programme || 'N/A',
        'NAME OF THE APPLICANT': r.rawName || 'N/A',
        'NAME OF FATHER': r.rawFatherName || 'N/A',
        'SCORE': r.scoreValue || '',
        'MOBILE': r.mobile || '',
        'Source Document': pdfFileName
    }));
    
    const worksheet = XLSX.utils.json_to_sheet(sheetData);
    
    // Auto-adjust column widths
    worksheet['!cols'] = [
        { wch: 8 },
        { wch: 20 },
        { wch: 35 },
        { wch: 30 },
        { wch: 30 },
        { wch: 12 },
        { wch: 15 },
        { wch: 25 }
    ];
    
    const workbook = XLSX.utils.book_new();
    const excelName = pdfFileName.replace(/\.pdf$/i, '') + '_Converted.xlsx';
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Converted PDF Data');
    
    // Trigger physical download of the converted Excel file
    XLSX.writeFile(workbook, excelName);
    
    // Convert workbook to File buffer for downstream Excel matching pipeline
    const wbArray = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    return new File([wbArray], excelName, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/**
 * Exports data table to Excel (.xlsx) file using SheetJS.
 * @param {Array<Object>} records - Display records to export
 * @param {string} fileName - Output file name
 */
function exportToExcel(records, fileName = 'SmartMatch_Results.xlsx') {
    if (!records || records.length === 0) {
        alert('No records available to export!');
        return;
    }
    
    const exportData = records.map(rec => ({
        'Status': rec.status,
        'Match Score (%)': rec.score !== undefined ? rec.score : 'N/A',
        'Person Name': rec.rawName || rec.name,
        'Father / Guardian Name': rec.rawFatherName || rec.fatherName,
        'Source File(s)': Array.isArray(rec.sourceFiles) ? rec.sourceFiles.join(', ') : rec.sourceFile,
        'Normalized Name': rec.normName || '',
        'Normalized Father Name': rec.normFatherName || '',
        'Mobile': rec.mobile || '',
        'Address': rec.address || ''
    }));
    
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    
    // Auto-adjust column widths
    const colWidths = Object.keys(exportData[0] || {}).map(key => ({
        wch: Math.max(key.length, ...exportData.map(row => String(row[key] || '').length)) + 3
    }));
    worksheet['!cols'] = colWidths;
    
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Match Results');
    XLSX.writeFile(workbook, fileName);
}

/**
 * Exports data table to PDF report using jsPDF & autoTable.
 * @param {Array<Object>} records - Display records to export
 * @param {string} title - Report title
 * @param {string} fileName - Output file name
 */
function exportToPDFReport(records, title = 'Smart Data Match Analyzer Report', fileName = 'Match_Report.pdf') {
    if (!records || records.length === 0) {
        alert('No records available to export!');
        return;
    }
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('l', 'pt', 'a4'); // Landscape orientation for better table fit
    
    // Header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(37, 99, 235); // Royal Blue
    doc.text(title, 40, 45);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text(`Generated on: ${new Date().toLocaleString()} | Total Records: ${records.length}`, 40, 65);
    
    // Prepare table headers and body
    const headers = [['#', 'Status', 'Score', 'Person Name', 'Father Name', 'Source File(s)', 'Mobile']];
    const body = records.map((rec, idx) => [
        idx + 1,
        rec.status || 'N/A',
        rec.score !== undefined ? `${rec.score}%` : '-',
        rec.rawName || rec.name || 'N/A',
        rec.rawFatherName || rec.fatherName || 'N/A',
        Array.isArray(rec.sourceFiles) ? rec.sourceFiles.join('\n') : rec.sourceFile || 'N/A',
        rec.mobile || '-'
    ]);
    
    doc.autoTable({
        startY: 85,
        head: headers,
        body: body,
        theme: 'grid',
        headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        styles: { fontSize: 9, cellPadding: 6, overflow: 'linebreak' },
        columnStyles: {
            0: { cellWidth: 30 },
            1: { cellWidth: 80, fontStyle: 'bold' },
            2: { cellWidth: 50 },
            3: { cellWidth: 140 },
            4: { cellWidth: 140 },
            5: { cellWidth: 180 }
        }
    });
    
    doc.save(fileName);
}
