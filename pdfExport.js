
// pdf-export.js
// Drop-in helper for exporting a visible section to PDF using html2canvas + jsPDF (UMD build).
// Usage:
// 1) Include after html2canvas & jsPDF UMD scripts and after your app renders the pages.
// 2) Call initPdfExport() once (e.g., on DOMContentLoaded).
// 3) Add a button with id="downloadResultsPdfBtn" or call downloadSectionAsPdf('#resultsPage .content').

(function () {
    function isHidden(el) {
      return !el || el.offsetParent === null || window.getComputedStyle(el).display === 'none' || window.getComputedStyle(el).visibility === 'hidden';
    }
  
    async function ensureVisible(selector, preShow) {
      const el = document.querySelector(selector);
      const prev = [];
      let node = el;
      // Walk up to make sure ancestors aren't display:none (common in multi-page apps).
      while (node && node !== document.body) {
        const style = window.getComputedStyle(node);
        if (style.display === 'none' || style.visibility === 'hidden') {
          prev.push({ node, style: { display: node.style.display, visibility: node.style.visibility } });
          node.style.display = 'block';
          node.style.visibility = 'visible';
        }
        node = node.parentElement;
      }
      if (typeof preShow === 'function') await preShow(el);
      return () => {
        // restore
        for (const { node, style } of prev.reverse()) {
          node.style.display = style.display;
          node.style.visibility = style.visibility;
        }
      };
    }
  
    async function downloadSectionAsPdf(selector, filename='export.pdf') {
      const restore = await ensureVisible(selector);
      try {
        const section = document.querySelector(selector);
        if (!section) throw new Error('Section not found: ' + selector);
  
        // Make sure jsPDF UMD is present
        let jsPDFCtor;
        if (window.jspdf && window.jspdf.jsPDF) {
          jsPDFCtor = window.jspdf.jsPDF;
        } else if (window.jsPDF) {
          jsPDFCtor = window.jsPDF;
        } else {
          throw new Error('jsPDF not found. Include the UMD build from CDN.');
        }
  
        // Snapshot
        const canvas = await html2canvas(section, {
          scale: Math.min(2, window.devicePixelRatio || 1.5),
          backgroundColor: '#ffffff',
          useCORS: true,
          allowTaint: true,
          windowWidth: document.documentElement.scrollWidth,
        });
  
        const page = new jsPDFCtor('p', 'mm', 'a4');
        const pageW = page.internal.pageSize.getWidth();
        const pageH = page.internal.pageSize.getHeight();
  
        const imgW = pageW;
        const imgH = (canvas.height * imgW) / canvas.width;
        const pxPerMm = canvas.width / pageW;
        const pageHeightPx = pageH * pxPerMm;
  
        const sliceCanvas = document.createElement('canvas');
        const ctx = sliceCanvas.getContext('2d');
  
        let y = 0;
        let pageIndex = 0;
        while (y < canvas.height) {
          const sliceHeight = Math.min(pageHeightPx, canvas.height - y);
          sliceCanvas.width = canvas.width;
          sliceCanvas.height = sliceHeight;
          ctx.clearRect(0, 0, sliceCanvas.width, sliceCanvas.height);
          ctx.drawImage(canvas, 0, y, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);
  
          const img = sliceCanvas.toDataURL('image/png', 1.0);
          if (pageIndex > 0) page.addPage();
          page.addImage(img, 'PNG', 0, 0, imgW, sliceHeight / pxPerMm);
          y += sliceHeight;
          pageIndex++;
        }
  
        page.save(filename);
        return true;
      } catch (err) {
        console.error('PDF export failed:', err);
        alert('PDF export failed: ' + err.message);
        return false;
      } finally {
        if (typeof restore === 'function') restore();
      }
    }
  
    function initPdfExport() {
      const btn = document.getElementById('downloadResultsPdfBtn');
      if (btn) {
        btn.addEventListener('click', function () {
          downloadSectionAsPdf('#resultsPage .content', 'procrastinauction-results.pdf');
        });
      }
      const printBtns = document.querySelectorAll('[data-print="section"]');
      printBtns.forEach(function (b) {
        b.addEventListener('click', function () {
          window.print();
        });
      });
    }
  
    // Expose
    window.downloadSectionAsPdf = downloadSectionAsPdf;
    window.initPdfExport = initPdfExport;
  })();