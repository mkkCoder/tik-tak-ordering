/**
 * jsPDF dynamically imports html2canvas and dompurify for its `.html()` method,
 * which TIKTAK never calls — the PDF is drawn as vectors, deliberately. Aliasing
 * them here keeps ~58 kB gzipped of dead code out of the deployed bundle.
 */
const unavailable = () => {
  throw new Error('html rendering is not part of TIKTAK; the PDF is drawn as vectors');
};

export default unavailable;
export const sanitize = unavailable;
