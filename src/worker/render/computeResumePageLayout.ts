/** 与 `resume-preview.css` 中 --rp-a4-width × 比例一致 */
export const RP_A4_WIDTH_PX = 595;
export const RP_A4_HEIGHT_PX = RP_A4_WIDTH_PX * Math.SQRT2;

/** 页间安全边距（首页下、末页上、中间页上下；单页无） */
export const RPP_PAGE_SAFE_MARGIN_PX = 36;

export type PageRole = 'only' | 'first' | 'middle' | 'last';

export type ResumePageViewport = {
  index: number;
  role: PageRole;
  offsetY: number;
  sliceHeight: number;
  viewportHeight: number;
};

export type ResumePageLayout = {
  pageCount: number;
  totalHeight: number;
  pageHeight: number;
  pages: ResumePageViewport[];
};

function sliceCapacity(pageHeight: number, role: PageRole): number {
  const safe = RPP_PAGE_SAFE_MARGIN_PX;
  switch (role) {
    case 'only':
      return pageHeight;
    case 'first':
      return pageHeight - safe;
    case 'middle':
      return pageHeight - safe * 2;
    case 'last':
      return pageHeight - safe;
  }
}

export function computePageLayoutFromTotalHeight(
  totalHeight: number,
  pageHeight: number = RP_A4_HEIGHT_PX,
): ResumePageLayout {
  const height = Math.ceil(Math.max(totalHeight, 0));

  if (height <= pageHeight) {
    return {
      pageCount: 1,
      totalHeight: height,
      pageHeight,
      pages: [
        {
          index: 0,
          role: 'only',
          offsetY: 0,
          sliceHeight: height,
          viewportHeight: Math.min(pageHeight, height),
        },
      ],
    };
  }

  const pages = hardCutPages(height, pageHeight);
  return {
    pageCount: pages.length,
    totalHeight: height,
    pageHeight,
    pages,
  };
}

export function hardCutPages(
  totalHeight: number,
  pageHeight: number = RP_A4_HEIGHT_PX,
): ResumePageViewport[] {
  if (totalHeight <= pageHeight) {
    return [frame(0, 'only', 0, totalHeight, pageHeight)];
  }

  const cFirst = sliceCapacity(pageHeight, 'first');
  const cMiddle = sliceCapacity(pageHeight, 'middle');
  const cLast = sliceCapacity(pageHeight, 'last');

  const pages: ResumePageViewport[] = [];
  let y = 0;

  const firstSlice = Math.min(cFirst, totalHeight);
  pages.push(frame(0, 'first', y, firstSlice, pageHeight));
  y += firstSlice;

  while (y < totalHeight) {
    const remaining = totalHeight - y;

    if (remaining <= cLast) {
      pages.push(frame(pages.length, 'last', y, remaining, pageHeight));
      break;
    }

    if (remaining <= cLast + cMiddle) {
      pages.push(frame(pages.length, 'last', y, remaining, pageHeight));
      break;
    }

    pages.push(frame(pages.length, 'middle', y, cMiddle, pageHeight));
    y += cMiddle;
  }

  return pages;
}

function viewportHeightForRole(
  role: PageRole,
  sliceHeight: number,
  pageHeight: number,
): number {
  const safe = RPP_PAGE_SAFE_MARGIN_PX;
  const content = Math.max(sliceHeight, 0);

  switch (role) {
    case 'only':
      return Math.min(pageHeight, content);
    case 'first':
      return Math.min(pageHeight, content + safe);
    case 'middle':
      return Math.min(pageHeight, content + safe * 2);
    case 'last':
      return content + safe;
  }
}

function frame(
  index: number,
  role: PageRole,
  offsetY: number,
  sliceHeight: number,
  pageHeight: number,
): ResumePageViewport {
  return {
    index,
    role,
    offsetY,
    sliceHeight,
    viewportHeight: viewportHeightForRole(role, sliceHeight, pageHeight),
  };
}
