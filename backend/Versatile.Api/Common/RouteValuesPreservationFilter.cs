using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace Versatile.Api.Common;

public class RouteValuesPreservationFilter : IResultFilter
{
    public void OnResultExecuting(ResultExecutingContext context)
    {
        if (context.Result is CreatedAtActionResult createdResult)
        {
            if (createdResult.RouteValues is null) return;
            var ambientValues = context.HttpContext.GetRouteData().Values;
            foreach (var (key, value) in ambientValues)
            {
                if (!createdResult.RouteValues.ContainsKey(key))
                {
                    createdResult.RouteValues[key] = value;
                }
            }
        }
    }

    public void OnResultExecuted(ResultExecutedContext context) { }
}
