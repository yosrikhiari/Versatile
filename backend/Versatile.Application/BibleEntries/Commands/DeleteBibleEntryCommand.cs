using MediatR;
using Versatile.Domain.Interfaces;
namespace Versatile.Application.BibleEntries.Commands;
public record DeleteBibleEntryCommand(Guid Id, Guid? OrganizationId, Guid UserId) : IRequest<Unit>, IRequiresOrganization;
