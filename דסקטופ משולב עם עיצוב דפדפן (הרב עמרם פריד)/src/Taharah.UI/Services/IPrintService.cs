using System.Windows.Documents;
using Taharah.Core.Algorithms;
using Taharah.UI.ViewModels;

namespace Taharah.UI.Services;

public interface IPrintService
{
    FlowDocument CreateMonthReport(
        int year,
        int month,
        string hebrewMonthName,
        int hebrewYear,
        IEnumerable<CalendarDayViewModel> days,
        string lifeState,
        string cityLabel,
        IEnumerable<EstablishedVeset> activeFixedVesets);

    bool PrintDocument(FlowDocument document, string description);
}
