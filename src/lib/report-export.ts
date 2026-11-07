import JSZip from 'jszip';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ReportResult,ReportFilters,ReportKey,ReportColumn,ReportRow } from './reporting';
import { filterSummary } from './reporting';
import type { ReportData } from './report-data';

function value(row:ReportRow,column:ReportColumn):string|number{
  const v=row[column.key];
  if(v!==null&&v!==undefined&&v!=='')return v;
  if(['suggested','reorder','minimum'].includes(column.key))return 'Not configured';
  if(column.key==='current')return 'Pending';
  return '—';
}
function generatedIst(date:Date){return date.toLocaleString('en-IN',{timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'short'});}

export async function excelBuffer(report:ReportResult,filters:ReportFilters,key:ReportKey,data:ReportData,generated:Date):Promise<Buffer>{
  const escapeXml=(input:string)=>input.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c] as string));
  const columnName=(index:number)=>{let name='';for(let n=index;n>0;n=Math.floor((n-1)/26))name=String.fromCharCode(65+(n-1)%26)+name;return name;};
  const last=Math.max(1,report.columns.length);
  const cell=(row:number,column:number,item:string|number,style:number)=>{
    const ref=`${columnName(column)}${row}`;
    return typeof item==='number'&&Number.isFinite(item)
      ?`<c r="${ref}" s="${style}"><v>${item}</v></c>`
      :`<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(String(item))}</t></is></c>`;
  };
  const metadata=[
    'PackFlow ERP',report.title,
    `Generated: ${generatedIst(generated)} IST  |  Rows: ${report.rows.length}`,
    filterSummary(filters,data,key),report.note,
  ];
  const rows=metadata.map((item,index)=>`<row r="${index+1}">${cell(index+1,1,item,index<2?index+1:3)}</row>`);
  rows.push(`<row r="6" ht="27" customHeight="1">${report.columns.map((column,index)=>cell(6,index+1,column.label,4)).join('')}</row>`);
  report.rows.forEach((row,index)=>{
    const rowNumber=index+7;
    rows.push(`<row r="${rowNumber}">${report.columns.map((column,columnIndex)=>{
      const item=value(row,column);
      const alternate=rowNumber%2===0;
      const style=typeof item==='number'&&column.kind==='number'?(alternate?8:5):
        (column.key==='specification'||column.key==='reason')?(alternate?9:6):(alternate?10:7);
      return cell(rowNumber,columnIndex+1,item,style);
    }).join('')}</row>`);
  });
  const widths=report.columns.map((column,index)=>`<col min="${index+1}" max="${index+1}" width="${Math.min(48,Math.max(14,column.key==='specification'?44:column.label.length+5))}" customWidth="1"/>`).join('');
  const merges=metadata.map((_,index)=>`<mergeCell ref="A${index+1}:${columnName(last)}${index+1}"/>`).join('');
  const sheet=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="6" topLeftCell="A7" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>${widths}</cols><sheetData>${rows.join('')}</sheetData><autoFilter ref="A6:${columnName(last)}${Math.max(6,report.rows.length+6)}"/><mergeCells count="5">${merges}</mergeCells></worksheet>`;
  const styles=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.###"/></numFmts><fonts count="5"><font><name val="Aptos"/><sz val="11"/></font><font><name val="Aptos"/><sz val="15"/><b/><color rgb="FF172B3A"/></font><font><name val="Aptos"/><sz val="13"/><b/><color rgb="FF172B3A"/></font><font><name val="Aptos"/><sz val="10"/><color rgb="FF5D7180"/></font><font><name val="Aptos"/><sz val="11"/><b/><color rgb="FFFFFFFF"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF176B91"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF3F7F9"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="11"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="4" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="164" fontId="0" fillId="3" borderId="0" xfId="0" applyNumberFormat="1" applyFill="1"/><xf numFmtId="0" fontId="0" fillId="3" borderId="0" xfId="0" applyFill="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="49" fontId="0" fillId="3" borderId="0" xfId="0" applyNumberFormat="1" applyFill="1"/></cellXfs></styleSheet>`;
  const zip=new JSZip();
  zip.file('[Content_Types].xml','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>');
  zip.file('_rels/.rels','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
  zip.file('xl/workbook.xml','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Report" sheetId="1" r:id="rId1"/></sheets></workbook>');
  zip.file('xl/_rels/workbook.xml.rels','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
  zip.file('xl/styles.xml',styles);
  zip.file('xl/worksheets/sheet1.xml',sheet);
  return zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
}

export async function pdfBuffer(report:ReportResult,filters:ReportFilters,key:ReportKey,data:ReportData,generated:Date):Promise<Buffer>{
  const doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a3',compress:true});
  const font=await readFile(path.join(process.cwd(),'assets/fonts/NotoSans-Regular.ttf'));
  doc.addFileToVFS('NotoSans-Regular.ttf',font.toString('base64'));
  doc.addFont('NotoSans-Regular.ttf','NotoSans','normal');doc.setFont('NotoSans');
  const summary=filterSummary(filters,data,key);
  autoTable(doc,{
    head:[report.columns.map(c=>c.label)],
    body:report.rows.map(row=>report.columns.map(c=>String(value(row,c)))),
    startY:43,margin:{top:43,left:12,right:12,bottom:15},
    styles:{font:'NotoSans',fontSize:7,cellPadding:2.2,overflow:'linebreak',valign:'top'},
    headStyles:{fillColor:[23,107,145],textColor:[255,255,255],fontStyle:'normal'},
    alternateRowStyles:{fillColor:[243,247,249]},
    horizontalPageBreak:true,horizontalPageBreakRepeat:0,
    didDrawPage:({pageNumber})=>{
      doc.setFont('NotoSans');doc.setTextColor(23,43,58);doc.setFontSize(10);doc.text('PackFlow ERP',12,12);
      doc.setFontSize(16);doc.text(report.title,12,20);
      doc.setFontSize(8);doc.setTextColor(93,113,128);
      doc.text(`Generated: ${generatedIst(generated)} IST  |  Rows: ${report.rows.length}`,12,26);
      const filterLines=doc.splitTextToSize(summary,doc.internal.pageSize.getWidth()-24);
      doc.text(filterLines.slice(0,2),12,31);
      doc.text(doc.splitTextToSize(report.note,doc.internal.pageSize.getWidth()-24).slice(0,1),12,39);
      doc.text(`Page ${pageNumber}`,doc.internal.pageSize.getWidth()-12,doc.internal.pageSize.getHeight()-7,{align:'right'});
    },
  });
  return Buffer.from(doc.output('arraybuffer'));
}
