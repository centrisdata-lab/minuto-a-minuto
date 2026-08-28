/**
 * exporters.js
 * Exportación del Minuto a Minuto (bloques + notas + recomendaciones
 * generales) a PDF, listo para imprimir o compartir — ver exportPdf. La
 * retroalimentación de "Después de la clase" es de uso interno del
 * profesor y no se incluye en el PDF descargable.
 * Depende de jsPDF + autotable, cargados por CDN en index.html.
 */

const Exporters = (() => {
  function timestampSuffix() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
  }

  /** Aplana los bloques contenedores (con sub-bloques anidados) a la lista simple de filas que ya generan los exportadores. */
  function flattenBlocks(blocks) {
    return (blocks || []).flatMap((container) => container.subBlocks || []);
  }

  /** Notas de bloque (a nivel contenedor, ej. Bloque 3) que sí tienen texto, en orden. */
  function collectBlockNotes(blocks) {
    return (blocks || [])
      .map((container) => (container.note || '').trim())
      .filter(Boolean);
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

  /** true si jsPDF y el plugin autotable (script CDN separado) están realmente disponibles. */
  function isPdfEngineReady() {
    return typeof window.jspdf !== 'undefined'
      && typeof window.jspdf.jsPDF === 'function'
      && typeof window.jspdf.jsPDF.API?.autoTable === 'function';
  }

  function exportPdf(plan) {
    if (typeof window.jspdf === 'undefined' || typeof window.jspdf.jsPDF !== 'function') {
      Toast.error('No se pudo cargar el módulo de PDF. Verifica tu conexión a internet.');
      return;
    }
    if (!isPdfEngineReady()) {
      Toast.error('No se pudo cargar un componente necesario para el PDF (tablas). Verifica tu conexión o desactiva temporalmente el bloqueador de anuncios.');
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
      const infoText = plan.courseLabel
        ? `Curso: ${plan.courseLabel}     |     Hora de inicio de la clase: ${plan.startTime || '-'}`
        : `Hora de inicio de la clase: ${plan.startTime || '-'}`;
      doc.text(infoText, 30, 66);

      const body = flattenBlocks(plan.blocks).map((b, i) => [
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

      let y = doc.lastAutoTable.finalY + 20;

      const notes = collectBlockNotes(plan.blocks);
      if (notes.length) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(30, 30, 30);
        notes.forEach((note) => {
          const lines = doc.splitTextToSize(`Nota: ${note}`, pageWidth - 60);
          doc.text(lines, 30, y);
          y += lines.length * 12 + 6;
        });
      }

      const recommendations = (plan.recommendations && plan.recommendations.notes || '').trim();
      if (recommendations) {
        y += 10;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(...navy);
        doc.text('Recomendaciones generales', 30, y);
        y += 16;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(30, 30, 30);
        recommendations.split('\n').forEach((line) => {
          const lines = doc.splitTextToSize(line || ' ', pageWidth - 60);
          doc.text(lines, 30, y);
          y += lines.length * 12 + 4;
        });
      }

      const fileName = buildFileName(plan.courseLabel, 'pdf');
      doc.save(fileName);
      Toast.success('PDF descargado correctamente.');
    } catch (e) {
      console.error(e);
      Toast.error('Ocurrió un error al generar el PDF.');
    }
  }

  return { exportPdf };
})();

window.Exporters = Exporters;
