import { BlmDocument } from '../../core/document/document.model';
import { AttachmentExporter } from '../../core/export/exporters/attachment-exporter';
import { DictionaryExporter, TermsExporter } from '../../core/export/exporters/knowledge-exporters';
import { PanoramaExporter } from '../../core/export/exporters/panorama-exporter';
import { RoleExporter } from '../../core/export/exporters/role-exporter';
import { ViewExporter } from '../../core/export/exporters/view-exporter';

export type PanoramaSubtab = 'overview' | 'roles' | 'terms' | 'dictionary' | 'rules' | 'attachments';

/** 根据当前 subtab 创建对应的 ViewExporter */
export function createCurrentPanoramaExporter(
  document: BlmDocument,
  tab: PanoramaSubtab,
  documentName = '',
): ViewExporter | null {
  switch (tab) {
    case 'overview':
      return new PanoramaExporter(document, documentName);
    case 'roles':
      return document.roles?.length ? new RoleExporter(document) : null;
    case 'terms':
      return new TermsExporter(document);
    case 'dictionary':
      return new DictionaryExporter(document);
    case 'attachments':
      return new AttachmentExporter(document, documentName);
    case 'rules':
      return null;
    default:
      return null;
  }
}
