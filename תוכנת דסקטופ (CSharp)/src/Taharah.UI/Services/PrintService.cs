using System.Windows;
using System.Windows.Controls;
using System.Windows.Documents;
using System.Windows.Media;
using Taharah.Core.Algorithms;
using Taharah.UI.ViewModels;

namespace Taharah.UI.Services;

public class PrintService : IPrintService
{
    public FlowDocument CreateMonthReport(
        int year,
        int month,
        string hebrewMonthName,
        int hebrewYear,
        IEnumerable<CalendarDayViewModel> days,
        string lifeState,
        string cityLabel,
        IEnumerable<EstablishedVeset> activeFixedVesets)
    {
        var doc = new FlowDocument
        {
            PagePadding = new Thickness(40),
            FontFamily = new FontFamily("Segoe UI Variable Text, Segoe UI, Arial"),
            FlowDirection = FlowDirection.RightToLeft,
            ColumnWidth = double.PositiveInfinity
        };

        // Title
        var title = new Paragraph(new Run("לוח טהרה — דוח מעקב וריכוז הלכתי"))
        {
            FontSize = 22,
            FontWeight = FontWeights.Bold,
            TextAlignment = TextAlignment.Center,
            Foreground = new SolidColorBrush(Color.FromRgb(24, 43, 73)),
            Margin = new Thickness(0, 0, 0, 8)
        };
        doc.Blocks.Add(title);

        // Subtitle with Hebrew / Gregorian month
        var subTitle = new Paragraph(new Run($"חודש {hebrewMonthName} {hebrewYear} | {month:D2}/{year}"))
        {
            FontSize = 14,
            TextAlignment = TextAlignment.Center,
            Foreground = new SolidColorBrush(Color.FromRgb(100, 116, 139)),
            Margin = new Thickness(0, 0, 0, 20)
        };
        doc.Blocks.Add(subTitle);

        // Profile details
        string lifeStateStr = lifeState switch
        {
            "pregnant" => "הריון",
            "nursing" => "מניקה",
            "pills" => "נטילת גלולות",
            _ => "רגיל"
        };
        var profilePara = new Paragraph(new Run($"מצב אישי: {lifeStateStr} | עיר: {cityLabel}"))
        {
            FontSize = 12,
            FontWeight = FontWeights.SemiBold,
            Margin = new Thickness(0, 0, 0, 12)
        };
        doc.Blocks.Add(profilePara);

        // Active fixed vesets section
        var vesetSection = new Paragraph(new Run("וסתות קבועים וחששות פעילים:"))
        {
            FontSize = 13,
            FontWeight = FontWeights.Bold,
            Margin = new Thickness(0, 8, 0, 6)
        };
        doc.Blocks.Add(vesetSection);

        var vesetList = new System.Windows.Documents.List();
        var vesets = activeFixedVesets.ToList();
        if (vesets.Count == 0)
        {
            vesetList.ListItems.Add(new ListItem(new Paragraph(new Run("אין כרגע וסתות קבועים מבוססים (מוחזקים). החישוב מבוסס על עונות פרישה שאינן קבועות."))));
        }
        else
        {
            foreach (var v in vesets)
            {
                string detail = v.DayOfMonth.HasValue ? $"יום בחודש: {v.DayOfMonth}" : (v.Span.HasValue ? $"הפלגה: {v.Span}" : "");
                vesetList.ListItems.Add(new ListItem(new Paragraph(new Run($"• {v.Kind} - עונה: {v.Ona}, {detail}"))));
            }
        }
        doc.Blocks.Add(vesetList);

        // Month Calendar Table
        var table = new Table
        {
            CellSpacing = 0,
            BorderThickness = new Thickness(1),
            BorderBrush = new SolidColorBrush(Color.FromRgb(226, 232, 240)),
            Margin = new Thickness(0, 16, 0, 16)
        };

        table.Columns.Add(new TableColumn { Width = new GridLength(85) });
        table.Columns.Add(new TableColumn { Width = new GridLength(85) });
        table.Columns.Add(new TableColumn { Width = new GridLength(70) });
        table.Columns.Add(new TableColumn { Width = new GridLength(110) });
        table.Columns.Add(new TableColumn { Width = new GridLength(100) });
        table.Columns.Add(new TableColumn { Width = new GridLength(200) });

        var headerGroup = new TableRowGroup();
        var headerRow = new TableRow
        {
            Background = new SolidColorBrush(Color.FromRgb(241, 245, 249))
        };

        string[] headers = ["תאריך עברי", "תאריך לועזי", "יום בשבוע", "זמני שקיעה/נץ", "סטטוס הלכתי", "פירוט עונות ואירועים"];
        foreach (var h in headers)
        {
            var cell = new TableCell(new Paragraph(new Run(h))
            {
                FontWeight = FontWeights.Bold,
                FontSize = 11,
                TextAlignment = TextAlignment.Center,
                Margin = new Thickness(4)
            })
            {
                BorderThickness = new Thickness(0, 0, 1, 1),
                BorderBrush = new SolidColorBrush(Color.FromRgb(226, 232, 240))
            };
            headerRow.Cells.Add(cell);
        }
        headerGroup.Rows.Add(headerRow);
        table.RowGroups.Add(headerGroup);

        var dataGroup = new TableRowGroup();
        int rowIndex = 0;
        foreach (var day in days.Where(d => d.IsCurrentMonth))
        {
            var row = new TableRow
            {
                Background = rowIndex % 2 == 0 
                    ? Brushes.White 
                    : new SolidColorBrush(Color.FromRgb(248, 250, 252))
            };

            string dayOfWeek = day.GregorianDate.ToString("dddd", new System.Globalization.CultureInfo("he-IL"));
            string zmanim = (!string.IsNullOrEmpty(day.Sunset) || !string.IsNullOrEmpty(day.Sunrise))
                ? $"{day.Sunset} / {day.Sunrise}"
                : "-";

            var badgeTexts = day.Badges.Select(b => b.Text).ToList();
            string eventsAndOnot = badgeTexts.Count > 0 ? string.Join(", ", badgeTexts) : "-";

            string[] cellValues = [
                day.HebrewDayString,
                day.GregorianDate.ToString("dd/MM/yyyy"),
                dayOfWeek,
                zmanim,
                day.StatusSummary,
                eventsAndOnot
            ];

            foreach (var val in cellValues)
            {
                var cell = new TableCell(new Paragraph(new Run(val))
                {
                    FontSize = 10.5,
                    TextAlignment = TextAlignment.Center,
                    Margin = new Thickness(3)
                })
                {
                    BorderThickness = new Thickness(0, 0, 1, 1),
                    BorderBrush = new SolidColorBrush(Color.FromRgb(226, 232, 240))
                };
                row.Cells.Add(cell);
            }

            dataGroup.Rows.Add(row);
            rowIndex++;
        }
        table.RowGroups.Add(dataGroup);
        doc.Blocks.Add(table);

        var footer = new Paragraph(new Run("נוצר באמצעות 'לוח טהרה' • נשמר ומגובה מקומית באופן מאובטח ומוצפן."))
        {
            FontSize = 9.5,
            Foreground = Brushes.Gray,
            TextAlignment = TextAlignment.Center,
            Margin = new Thickness(0, 20, 0, 0)
        };
        doc.Blocks.Add(footer);

        return doc;
    }

    public bool PrintDocument(FlowDocument document, string description)
    {
        var dlg = new PrintDialog();
        if (dlg.ShowDialog() == true)
        {
            IDocumentPaginatorSource source = document;
            dlg.PrintDocument(source.DocumentPaginator, description);
            return true;
        }
        return false;
    }
}
