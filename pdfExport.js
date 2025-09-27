// pdfExport.js (fixed)
// Exports the Results summary (Updated Points + Tasks by User) to a clean A4 PDF
// using html2canvas + jsPDF. Avoids "zoomed-in" PDFs by fitting to page width
// with margins and correct pixel/mm conversion.
//
// Requires UMD builds loaded before this script:
//   html2canvas 1.4+  and  jsPDF 2.5+ (UMD)
(function(){
    // -------- Utilities --------
    function isHidden(el){
      if (!el) return true;
      const cs = window.getComputedStyle(el);
      return el.offsetParent === null || cs.display === 'none' || cs.visibility === 'hidden';
    }
  
    async function ensureVisible(selectorOrEl, preShow){
      const el = typeof selectorOrEl === 'string' ? document.querySelector(selectorOrEl) : selectorOrEl;
      const prev = [];
      let cur = el;
      while (cur && cur !== document.body){
        const cs = window.getComputedStyle(cur);
        if (cs.display === 'none' || cs.visibility === 'hidden'){
          prev.push({ node: cur, display: cur.style.display, visibility: cur.style.visibility });
          cur.style.display = 'block';
          cur.style.visibility = 'visible';
        }
        cur = cur.parentElement;
      }
      try {
        if (typeof preShow === 'function') await preShow();
        await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
        return el;
      } finally {
        prev.forEach(p => { p.node.style.display = p.display || ''; p.node.style.visibility = p.visibility || ''; });
      }
    }
  
    // Render an element into paginated A4, fitting width with margins.
    async function elementToPdfFitWidth(el, filename){
      if (typeof html2canvas !== 'function') throw new Error('html2canvas not found');
      let jsPDFCtor;
      if (window.jspdf && window.jspdf.jsPDF) jsPDFCtor = window.jspdf.jsPDF;
      else if (window.jsPDF) jsPDFCtor = window.jsPDF;
      else throw new Error('jsPDF not found');
  
      // Snapshot
      const canvas = await html2canvas(el, {
        scale: 2, // crisp but bounded
        backgroundColor: '#ffffff',
        useCORS: true,
        allowTaint: true,
        windowWidth: document.documentElement.clientWidth,
        windowHeight: document.documentElement.clientHeight
      });
  
      const pdf = new jsPDFCtor({ unit: 'mm', format: 'a4' });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 10; // mm
      const imgWmm = pageW - margin * 2;
      const imgXmm = margin;
  
      // Map canvas.width -> imgWmm mm
      const pxPerMm = canvas.width / imgWmm;
      const usableHeightPx = (pageH - margin * 2) * pxPerMm;
  
      const sliceCanvas = document.createElement('canvas');
      const ctx = sliceCanvas.getContext('2d');
  
      let y = 0;
      let pageIndex = 0;
      while (y < canvas.height){
        const sliceHeight = Math.min(usableHeightPx, canvas.height - y);
        sliceCanvas.width = canvas.width;
        sliceCanvas.height = sliceHeight;
        ctx.clearRect(0, 0, sliceCanvas.width, sliceCanvas.height);
        ctx.drawImage(canvas, 0, y, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);
        const img = sliceCanvas.toDataURL('image/png', 1.0);
        if (pageIndex > 0) pdf.addPage();
        const imgHmm = sliceHeight / pxPerMm; // height (mm) of this slice
        pdf.addImage(img, 'PNG', imgXmm, margin, imgWmm, imgHmm);
        y += sliceHeight;
        pageIndex++;
      }
  
      pdf.save(filename || 'export.pdf');
    }
  
    async function downloadSectionAsPdf(selector, filename){
      const el = await ensureVisible(selector);
      await elementToPdfFitWidth(el, filename || 'export.pdf');
    }
  
    // -------- Result summary export --------
    async function exportResultsSummaryPdf(filename = 'procrastinauction-results.pdf'){
      try { if (typeof window.beforeExport === 'function') await window.beforeExport(); } catch(e){}
  
      const resultsContent = document.querySelector('#resultsPage .content');
      if (!resultsContent) return downloadSectionAsPdf('#resultsPage .content', filename);
  
      const sections = Array.from(resultsContent.querySelectorAll('.section'));
      const wanted = sections.filter(sec => {
        const h = sec.querySelector('h3');
        return h && (/Updated Points/i.test(h.textContent) || /Tasks by User/i.test(h.textContent));
      });
  
      if (wanted.length === 0){
        return downloadSectionAsPdf(resultsContent, filename);
      }
  
      // Build narrow temporary container so width maps nicely to a page
      const temp = document.createElement('div');
      temp.style.position = 'fixed';
      temp.style.left = '-100000px';
      temp.style.top = '0';
      // Clamp to avoid gigantic canvases (prevents 17-page zoom effect)
      const targetWidthPx = Math.min(900, resultsContent.getBoundingClientRect().width || 900);
      temp.style.width = targetWidthPx + 'px';
      temp.style.background = '#ffffff';
      temp.style.padding = '24px';
      temp.style.boxSizing = 'border-box';
  
      const title = document.createElement('h2');
      title.textContent = 'Procrastinauction — Round Summary';
      title.style.margin = '0 0 12px 0';
      title.style.fontSize = '20px';
      title.style.fontWeight = '600';
      temp.appendChild(title);
  
      wanted.forEach(sec => {
        const clone = sec.cloneNode(true);
        clone.querySelectorAll('button, input, .no-print, [data-print="section"]').forEach(el => el.remove());
        temp.appendChild(clone);
      });
  
      document.body.appendChild(temp);
      try{
        await ensureVisible(temp);
        await elementToPdfFitWidth(temp, filename);
      } finally {
        document.body.removeChild(temp);
      }
    }
  
    // -------- Wiring --------
    function initPdfExport(){
      const btn = document.getElementById('downloadResultsPdfBtn');
      if (btn){
        btn.addEventListener('click', function(){
          exportResultsSummaryPdf('procrastinauction-results.pdf');
        });
      }
      const printBtns = document.querySelectorAll('[data-print="section"]');
      printBtns.forEach(function (b) {
        b.addEventListener('click', function () { window.print(); });
      });
    }
  
    // Expose
    window.downloadSectionAsPdf = downloadSectionAsPdf;
    window.exportResultsSummaryPdf = exportResultsSummaryPdf;
    window.initPdfExport = initPdfExport;
  })();
  