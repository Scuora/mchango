// The photographs from the eulogy booklet's gallery pages, for /gallery: each in
// a grid size (720 px on the long side) and a larger one opened on tap (1400 px).
// Files are /img/gallery/NN.jpg and /img/gallery/full/NN.jpg, in the booklet's order.

/** Width and height of each grid image, in order; photo n is index n - 1. */
const SIZES: readonly (readonly [number, number])[] = [[628,720],[540,720],[540,720],[540,720],[540,720],[540,720],[540,720],[526,720],[540,720],[540,720],[540,720],[535,720],[540,720],[461,720],[540,720],[540,720],[540,720],[540,720],[720,540],[540,720],[540,720],[720,540],[720,540],[720,540],[720,540],[720,540],[540,720],[540,720],[540,720],[720,540],[321,720],[720,540],[720,540],[540,720],[540,720],[540,720],[720,480],[540,720],[461,720],[540,720],[540,720],[540,720],[540,720],[540,720],[540,720],[540,720],[540,720],[540,720],[540,720]];

export const GALLERY = SIZES.map(([width, height], i) => {
  const n = String(i + 1).padStart(2, "0");
  return { src: `/img/gallery/${n}.jpg`, full: `/img/gallery/full/${n}.jpg`, width, height };
});
