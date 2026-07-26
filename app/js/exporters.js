/**
 * exporters.js
 * Exportación del Minuto a Minuto (solo la sección "Preparación de clase")
 * a Excel (.xlsx) y a PDF (listo para imprimir/compartir). Las secciones
 * "Durante la clase" y "Después de la clase" son de uso interno del profesor
 * y no se incluyen en los archivos descargables.
 * Depende de SheetJS (XLSX) y jsPDF + autotable, cargados por CDN en index.html.
 */

const Exporters = (() => {
  function timestampSuffix() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
  }

  /** Construye un nombre de archivo seguro incluyendo el nombre del curso si existe. */
  function buildFileName(courseName, extension) {
    const base = 'minuto_a_minuto';
    if (!courseName || !courseName.trim()) {
      return `${base}_${timestampSuffix()}.${extension}`;
    }
    const safeCourse = courseName
      .trim()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9\s-]/g, '')
      .replace(/\s+/g, '_')
      .toLowerCase();
    return `${base}_${safeCourse}_${timestampSuffix()}.${extension}`;
  }

  function exportXlsx(plan) {
    if (typeof XLSX === 'undefined') {
      Toast.error('No se pudo cargar el módulo de Excel. Verifica tu conexión a internet.');
      return;
    }
    try {
      const rows = [];
      rows.push(['MINUTO A MINUTO']);
      rows.push([]);
      rows.push(['Nombre del curso:', plan.courseName || '']);
      rows.push(['Hora de inicio de la clase:', plan.startTime || '']);
      rows.push([]);
      rows.push(['(Diapositiva)', '(Bloque)', '(Duración)', '(Hora Inicio)', '(Actividad)', '(Recursos/Links)', '(Responsable)']);
      (plan.blocks || []).forEach((b, i) => {
        rows.push([i + 1, b.name || '', b.duration || '', b.start || '', b.activity || '', b.resources || '', b.responsible || '']);
      });

      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws['!cols'] = [
        { wch: 14 }, { wch: 26 }, { wch: 12 }, { wch: 14 }, { wch: 34 }, { wch: 24 }, { wch: 16 },
      ];
      ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 6 } },
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Minuto a Minuto');

      const fileName = buildFileName(plan.courseName, 'xlsx');
      XLSX.writeFile(wb, fileName);
      Toast.success('Archivo Excel descargado correctamente.');
    } catch (e) {
      console.error(e);
      Toast.error('Ocurrió un error al generar el Excel.');
    }
  }

  function exportPdf(plan) {
    if (typeof window.jspdf === 'undefined') {
      Toast.error('No se pudo cargar el módulo de PDF. Verifica tu conexión a internet.');
      return;
    }
    try {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();

      const navy = [22, 42, 82];
      const orange = [232, 138, 26];

      doc.setFillColor(...navy);
      doc.rect(0, 0, pageWidth, 46, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.text('MINUTO A MINUTO', 30, 29);

      doc.setTextColor(30, 30, 30);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      const infoText = plan.courseName
        ? `Curso: ${plan.courseName}     |     Hora de inicio de la clase: ${plan.startTime || '-'}`
        : `Hora de inicio de la clase: ${plan.startTime || '-'}`;
      doc.text(infoText, 30, 66);

      const body = (plan.blocks || []).map((b, i) => [
        i + 1,
        b.name || '',
        b.duration ? Utils.durationLabel(b.duration) : '',
        b.start || '',
        b.activity || '',
        b.resources || '',
        b.responsible || '',
      ]);

      doc.autoTable({
        startY: 78,
        head: [['#', 'Bloque', 'Duración', 'Hora inicio', 'Actividad', 'Recursos / Links', 'Responsable']],
        body,
        theme: 'grid',
        headStyles: { fillColor: orange, textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [244, 247, 251] },
        styles: { fontSize: 9, cellPadding: 6, valign: 'middle' },
        columnStyles: {
          0: { cellWidth: 26, halign: 'center' },
          2: { cellWidth: 60, halign: 'center' },
          3: { cellWidth: 60, halign: 'center' },
          4: { cellWidth: 220 },
        },
      });

      const fileName = buildFileName(plan.courseName, 'pdf');
      doc.save(fileName);
      Toast.success('PDF descargado correctamente.');
    } catch (e) {
      console.error(e);
      Toast.error('Ocurrió un error al generar el PDF.');
    }
  }

  return { exportXlsx, exportPdf };
})();

window.Exporters = Exporters;
