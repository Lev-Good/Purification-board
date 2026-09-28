using System.Windows;
using System.Windows.Controls;
using System.Windows.Documents;
using System.Windows.Media;
using Taharah.Core.Algorithms;
using Taharah.UI.ViewModels;

namespace Taharah.UI.Services;

/// <summary>
/// בונה את דוח המעקב החודשי להדפסה.
/// </summary>
/// <remarks>
/// **הצבעים כאן אינם מגיעים ממערכת העיצוב של המסך, ובכוונה.** הדוח מודפס תמיד
/// על נייר לבן, ולכן הוא חייב פלטה קבועה ובלתי-תלויה במצב יום/לילה של התוכנה -
/// אחרת הדפסה מתוך מצב לילה הייתה יוצרת טקסט בהיר על נייר לבן, בלתי קריא.
/// אלו צבעי "דיו על נייר", לא טוקנים של ממשק.
/// </remarks>
public class PrintService : IPrintService
{
    // פלטת נייר קבועה (ראה ההערה במחלקה)
    private static readonly SolidColorBrush InkBrush = new(Color.FromRgb(0x11, 0x18, 0x27));
    private static readonly SolidColorBrush MutedBrush = new(Color.FromRgb(0x6B, 0x72, 0x80));
    private static readonly SolidColorBrush RuleBrush = new(Color.FromRgb(0xE5, 0xE7, 0xEB));
    private static readonly SolidColorBrush HeadBgBrush = new(Color.FromRgb(0xF5, 0xF7, 0xFA));
    private static readonly SolidColorBrush ZebraBrush = new(Color.FromRgb(0xFA, 0xFB, 0xFC));
    private static readonly SolidColorBrush AccentBrush = new(Color.FromRgb(0x4F, 0x46, 0xE5));
    private static readonly SolidColorBrush SightingBrush = new(Color.FromRgb(0xB9, 0x1C, 0x1C));
    private static readonly SolidColorBrush MikvehBrush = new(Color.FromRgb(0x0F, 0x76, 0x6E));
    private static readonly SolidColorBrush NekiimBrush = new(Color.FromRgb(0x03, 0x69, 0xA1));
    private static readonly SolidColorBrush HefsekBrush = new(Color.FromRgb(0x15, 0x80, 0x3D));

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
            FontFamily = new FontFamily("Segoe UI Variable Text, Segoe UI, Arial Hebrew, Tahoma, Arial"),
            FlowDirection = FlowDirection.RightToLeft,
            ColumnWidth = double.PositiveInfinity,
            Foreground = InkBrush
        };

        // ---------- כותרת ----------
        doc.Blocks.Add(new Paragraph(new Run("לוח טהרה — דוח מעקב וריכוז הלכתי"))
        {
            FontSize = 21,
            FontWeight = FontWeights.Bold,
            TextAlignment = TextAlignment.Center,
            Foreground = InkBrush,
            Margin = new Thickness(0, 0, 0, 4)
        });

        // קו מפריד בצבע המותג מתחת לכותרת
        doc.Blocks.Add(new Paragraph
        {
            BorderThickness = new Thickness(0, 0, 0, 2),
            BorderBrush = AccentBrush,
            Margin = new Thickness(0, 0, 0, 12)
        });

        doc.Blocks.Add(new Paragraph(new Run($"חודש {hebrewMonthName} {hebrewYear}  ·  {month:D2}/{year}"))
        {
            FontSize = 13.5,
            TextAlignment = TextAlignment.Center,
            Foreground = MutedBrush,
            Margin = new Thickness(0, 0, 0, 16)
        });

        // ---------- שורת פרטים אישיים ----------
        string lifeStateStr = lifeState switch
        {
            "pregnant" => "הריון",
            "nursing" => "מניקה",
            "pills" => "נטילת גלולות",
            _ => "רגיל"
        };

        var profileTable = new Table { CellSpacing = 0, Margin = new Thickness(0, 0, 0, 18) };
        profileTable.Columns.Add(new TableColumn { Width = new GridLength(1, GridUnitType.Star) });
        profileTable.Columns.Add(new TableColumn { Width = new GridLength(1, GridUnitType.Star) });

        var profileRow = new TableRow { Background = HeadBgBrush };
        profileRow.Cells.Add(InfoCell("מצב אישי", lifeStateStr));
        profileRow.Cells.Add(InfoCell("עיר (לזמני היום)", cityLabel));

        var profileGroup = new TableRowGroup();
        profileGroup.Rows.Add(profileRow);
        profileTable.RowGroups.Add(profileGroup);
        doc.Blocks.Add(profileTable);

        // ---------- וסתות קבועים וחששות פעילים ----------
        doc.Blocks.Add(SectionHeading("וסתות קבועים וחששות פעילים"));

        var vesets = activeFixedVesets.ToList();
        if (vesets.Count == 0)
        {
            doc.Blocks.Add(new Paragraph(new Run(
                "אין כרגע וסתות קבועים מבוססים (מוחזקים). החישוב מבוסס על עונות פרישה שאינן קבועות."))
            {
                FontSize = 11.5,
                FontStyle = FontStyles.Italic,
                Foreground = MutedBrush,
                Margin = new Thickness(0, 0, 0, 4)
            });
        }
        else
        {
            var vesetList = new System.Windows.Documents.List { MarkerStyle = TextMarkerStyle.Disc, Margin = new Thickness(16, 0, 0, 0) };
            foreach (var v in vesets)
            {
                // DescribeVeset מחזיר תיאור בעברית מלא ("וסת קבוע ליום י״ח בחודש (עונת יום)").
                // ניסוח ישיר של v.Kind/v.Ona היה מפיק את שמות ה-enum באנגלית ("Day"/"Night").
                string detail = v.Span.HasValue ? $" — הפלגה של {v.Span} יום" : string.Empty;
                var p = new Paragraph
                {
                    FontSize = 11.5,
                    Margin = new Thickness(0, 0, 0, 3)
                };
                p.Inlines.Add(new Run(ChazakaManager.DescribeVeset(v)) { FontWeight = FontWeights.SemiBold });
                if (detail.Length > 0)
                {
                    p.Inlines.Add(new Run(detail) { Foreground = MutedBrush });
                }
                vesetList.ListItems.Add(new ListItem(p));
            }
            doc.Blocks.Add(vesetList);
        }

        // ---------- טבלת החודש ----------
        doc.Blocks.Add(SectionHeading("פירוט ימי החודש"));

        var table = new Table
        {
            CellSpacing = 0,
            Margin = new Thickness(0, 0, 0, 14)
        };

        double[] widths = [92, 80, 68, 108, 96, 270];
        foreach (double w in widths)
        {
            table.Columns.Add(new TableColumn { Width = new GridLength(w) });
        }

        string[] headers = ["תאריך עברי", "תאריך לועזי", "יום בשבוע", "שקיעה / נץ", "סטטוס הלכתי", "עונות ואירועים"];

        var headerGroup = new TableRowGroup();
        var headerRow = new TableRow { Background = HeadBgBrush };
        foreach (var h in headers)
        {
            headerRow.Cells.Add(new TableCell(new Paragraph(new Run(h))
            {
                FontWeight = FontWeights.Bold,
                FontSize = 11,
                TextAlignment = TextAlignment.Center,
                Foreground = InkBrush,
                Margin = new Thickness(5, 7, 5, 7)
            })
            {
                BorderThickness = new Thickness(0, 0, 0, 1.5),
                BorderBrush = AccentBrush
            });
        }
        headerGroup.Rows.Add(headerRow);
        table.RowGroups.Add(headerGroup);

        var dataGroup = new TableRowGroup();
        int rowIndex = 0;
        foreach (var day in days.Where(d => d.IsCurrentMonth))
        {
            var row = new TableRow { Background = rowIndex % 2 == 1 ? ZebraBrush : Brushes.Transparent };

            string dayOfWeek = day.GregorianDate.ToString("dddd", new System.Globalization.CultureInfo("he-IL"));
            string zmanim = (!string.IsNullOrEmpty(day.Sunset) || !string.IsNullOrEmpty(day.Sunrise))
                ? $"{day.Sunset} / {day.Sunrise}"
                : "-";

            var badgeTexts = day.Badges.Select(b => b.Text).ToList();
            string eventsAndOnot = badgeTexts.Count > 0 ? string.Join(" · ", badgeTexts) : "-";

            string[] cellValues = [
                day.HebrewDayString,
                day.GregorianDate.ToString("dd/MM/yyyy"),
                dayOfWeek,
                zmanim,
                day.StatusSummary,
                eventsAndOnot
            ];

            for (int c = 0; c < cellValues.Length; c++)
            {
                bool isStatus = c == 4;
                var p = new Paragraph(new Run(cellValues[c]))
                {
                    FontSize = 10.5,
                    TextAlignment = TextAlignment.Center,
                    Foreground = isStatus ? StatusBrush(day) : InkBrush,
                    FontWeight = isStatus ? FontWeights.SemiBold : FontWeights.Normal,
                    Margin = new Thickness(5, 5, 5, 5)
                };
                row.Cells.Add(new TableCell(p)
                {
                    BorderThickness = new Thickness(0, 0, 0, 0.5),
                    BorderBrush = RuleBrush
                });
            }

            dataGroup.Rows.Add(row);
            rowIndex++;
        }
        table.RowGroups.Add(dataGroup);
        doc.Blocks.Add(table);

        // ---------- אזור הערות המורה הוראה ----------
        var notesBox = new Table
        {
            CellSpacing = 0,
            Margin = new Thickness(0, 8, 0, 0)
        };
        notesBox.Columns.Add(new TableColumn { Width = new GridLength(1, GridUnitType.Star) });

        var notesGroup = new TableRowGroup();
        var notesRow = new TableRow();
        var notesCell = new TableCell(new Paragraph(new Run("למילוי המורה הוראה:"))
        {
            FontSize = 11,
            FontWeight = FontWeights.SemiBold,
            Foreground = InkBrush,
            Margin = new Thickness(8, 6, 8, 4)
        })
        {
            BorderThickness = new Thickness(1),
            BorderBrush = RuleBrush
        };
        notesCell.Blocks.Add(new Paragraph(new Run(" ")) { Margin = new Thickness(8, 0, 8, 10) });
        notesCell.Blocks.Add(new Paragraph(new Run(" ")) { Margin = new Thickness(8, 0, 8, 10) });
        notesRow.Cells.Add(notesCell);
        notesGroup.Rows.Add(notesRow);
        notesBox.RowGroups.Add(notesGroup);
        doc.Blocks.Add(notesBox);

        // ---------- כותרת תחתונה ----------
        doc.Blocks.Add(new Paragraph(new Run(
            "נוצר באמצעות 'לוח טהרה' · הנתונים נשמרים ומגובים מקומית באופן מוצפן · הדוח אינו תחליף להוראת רב"))
        {
            FontSize = 9.5,
            Foreground = MutedBrush,
            TextAlignment = TextAlignment.Center,
            Margin = new Thickness(0, 18, 0, 0)
        });

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

    private static Paragraph SectionHeading(string text) => new(new Run(text))
    {
        FontSize = 13,
        FontWeight = FontWeights.Bold,
        Foreground = InkBrush,
        Margin = new Thickness(0, 10, 0, 6)
    };

    private static TableCell InfoCell(string label, string value)
    {
        var cell = new TableCell
        {
            BorderThickness = new Thickness(0.5),
            BorderBrush = RuleBrush
        };
        cell.Blocks.Add(new Paragraph(new Run($"{label}: {value}"))
        {
            FontSize = 11.5,
            FontWeight = FontWeights.SemiBold,
            Foreground = InkBrush,
            Margin = new Thickness(8, 6, 8, 6)
        });
        return cell;
    }

    /// <summary>צבע הסטטוס בתא הטבלה, לפי סדר העדיפויות של DetermineDayStatus.</summary>
    private static SolidColorBrush StatusBrush(CalendarDayViewModel day)
    {
        if (day.HasReiya) return SightingBrush;
        if (day.IsHefsekTaharah) return HefsekBrush;
        if (day.IsMikvehNight) return MikvehBrush;
        if (day.IsShevaNekiyimDay) return NekiimBrush;
        return InkBrush;
    }
}
