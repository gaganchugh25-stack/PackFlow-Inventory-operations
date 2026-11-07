import ExcelJS from 'exceljs';
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
  const workbook=new ExcelJS.Workbook();workbook.creator='PackFlow ERP';workbook.created=generated;
  const sheet=workbook.addWorksheet('Report',{views:[{state:'frozen',ySplit:6}]});
  const last=Math.max(1,report.columns.length);
  sheet.mergeCells(1,1,1,last);sheet.getCell(1,1).value='PackFlow ERP';
  sheet.mergeCells(2,1,2,last);sheet.getCell(2,1).value=report.title;
  sheet.mergeCells(3,1,3,last);sheet.getCell(3,1).value=`Generated: ${generatedIst(generated)} IST  |  Rows: ${report.rows.length}`;
  sheet.mergeCells(4,1,4,last);sheet.getCell(4,1).value=filterSummary(filters,data,key);
  sheet.mergeCells(5,1,5,last);sheet.getCell(5,1).value=report.note;
  for(const n of [1,2]){const cell=sheet.getCell(n,1);cell.font={name:'Aptos',bold:true,size:n===1?15:13,color:{argb:'FF172B3A'}};}
  for(const n of [3,4,5]){sheet.getCell(n,1).font={name:'Aptos',size:10,color:{argb:'FF5D7180'}};}
  sheet.getRow(6).values=report.columns.map(c=>c.label);
  sheet.getRow(6).height=27;
  sheet.getRow(6).eachCell(cell=>{cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF176B91'}};cell.font={name:'Aptos',bold:true,color:{argb:'FFFFFFFF'}};cell.alignment={vertical:'middle',wrapText:true};});
  report.columns.forEach((column,index)=>{sheet.getColumn(index+1).width=Math.min(48,Math.max(14,column.key==='specification'?44:column.label.length+5));});
  for(const row of report.rows){
    const excelRow=sheet.addRow(report.columns.map(column=>value(row,column)));
    excelRow.eachCell((cell,index)=>{
      const column=report.columns[index-1];cell.alignment={vertical:'top',wrapText:column.key==='specification'||column.key==='reason'};
      if(column.kind==='number'&&typeof cell.value==='number')cell.numFmt='#,##0.###';
      if(column.kind==='text'||column.key==='item_code'||column.key==='reference'||column.key==='order')cell.numFmt='@';
    });
    if(excelRow.number%2===0)excelRow.eachCell(cell=>{cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF3F7F9'}};});
  }
  sheet.autoFilter={from:{row:6,column:1},to:{row:Math.max(6,report.rows.length+6),column:last}};
  const buffer=await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
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
