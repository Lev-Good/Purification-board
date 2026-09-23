using System.Globalization;
using System.Windows.Data;
using System.Windows.Media;
using Taharah.UI.ViewModels;

namespace Taharah.UI.Converters;

public class BadgeBackgroundConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
    {
        if (value is BadgeCategory category)
        {
            return category switch
            {
                BadgeCategory.Sighting => new SolidColorBrush(Color.FromRgb(254, 226, 226)),     // soft red #FEE2E2
                BadgeCategory.PrishaDay => new SolidColorBrush(Color.FromRgb(254, 243, 199)),    // amber #FEF3C7
                BadgeCategory.PrishaNight => new SolidColorBrush(Color.FromRgb(224, 231, 255)),  // indigo #E0E7FF
                BadgeCategory.OrZarua => new SolidColorBrush(Color.FromRgb(241, 245, 249)),      // slate #F1F5F9
                BadgeCategory.Hefsek => new SolidColorBrush(Color.FromRgb(220, 252, 231)),       // light green #DCFCE7
                BadgeCategory.ShevaNekiyim => new SolidColorBrush(Color.FromRgb(224, 242, 254)), // sky #E0F2FE
                BadgeCategory.Mikveh => new SolidColorBrush(Color.FromRgb(209, 250, 229)),       // emerald #D1FAE5
                BadgeCategory.Check => new SolidColorBrush(Color.FromRgb(243, 244, 246)),        // gray #F3F4F6
                BadgeCategory.Mark => new SolidColorBrush(Color.FromRgb(254, 249, 195)),         // yellow #FEF9C3
                BadgeCategory.Fertility => new SolidColorBrush(Color.FromRgb(204, 251, 241)),    // teal-100 #CCFBF1
                BadgeCategory.Ovulation => new SolidColorBrush(Color.FromRgb(153, 246, 228)),    // teal-200 #99F6E4
                _ => Brushes.Transparent
            };
        }
        return Brushes.LightGray;
    }

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture) =>
        throw new NotImplementedException();
}

public class BadgeForegroundConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
    {
        if (value is BadgeCategory category)
        {
            return category switch
            {
                BadgeCategory.Sighting => new SolidColorBrush(Color.FromRgb(185, 28, 28)),      // deep red #B91C1C
                BadgeCategory.PrishaDay => new SolidColorBrush(Color.FromRgb(180, 83, 9)),      // deep amber #B45309
                BadgeCategory.PrishaNight => new SolidColorBrush(Color.FromRgb(67, 56, 202)),   // deep indigo #4338CA
                BadgeCategory.OrZarua => new SolidColorBrush(Color.FromRgb(71, 85, 105)),       // slate #475569
                BadgeCategory.Hefsek => new SolidColorBrush(Color.FromRgb(21, 128, 61)),        // deep green #15803D
                BadgeCategory.ShevaNekiyim => new SolidColorBrush(Color.FromRgb(3, 105, 161)),  // deep sky #0369A1
                BadgeCategory.Mikveh => new SolidColorBrush(Color.FromRgb(4, 120, 87)),         // deep emerald #047857
                BadgeCategory.Check => new SolidColorBrush(Color.FromRgb(55, 65, 81)),          // gray #374151
                BadgeCategory.Mark => new SolidColorBrush(Color.FromRgb(161, 98, 7)),           // deep yellow #A16207
                BadgeCategory.Fertility => new SolidColorBrush(Color.FromRgb(15, 118, 110)),    // deep teal #0F766E
                BadgeCategory.Ovulation => new SolidColorBrush(Color.FromRgb(17, 94, 89)),      // deeper teal #115E59
                _ => Brushes.Black
            };
        }
        return Brushes.Black;
    }

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture) =>
        throw new NotImplementedException();
}
