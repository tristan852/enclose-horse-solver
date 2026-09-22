% Static ASP model for enclose.horse.
%
% The instance-specific input is supplied as facts, for example:
%   mode(normal).
%   budget(6).
%   grass(3,2).
%   horse(4,3).
%   unicorn(7,5).                 % only in the two unicorn modes
%   boundary(0,0).
%   adj(3,2,4,2).                  % generate both directions
%   portal_edge(2,4,8,1).          % generate both directions
%   tile_score(4,3,1).
%
% tile_score/3 contains the complete value of a reachable tile:
%   ordinary reachable tile = 1
%   cherry                   = 4  (base 1 + 3)
%   golden apple             = 11 (base 1 + 10)
%   bee swarm                = -4 (base 1 - 5)
%   water                    = 0

#const costly_wall_score = -6.

% ------------------------------------------------------------------------------
% Wall placement
% ------------------------------------------------------------------------------

% Walls may only be placed on grass.
{ wall(X,Y) } :- grass(X,Y).

% The wall budget is an upper bound.
:- budget(B), B < #count { X,Y : wall(X,Y) }.

% Some puzzle data includes a previously known optimum. When supplied, the
% generated instance facts contain optimal_score/1 and the objective is fixed
% to that exact value. Without the fact, Clingo remains free to optimize it.
objective_score(S) :-
    S = #sum {
        Score,X,Y : covered(X,Y), tile_score(X,Y,Score);
        costly_wall_score,X,Y : mode(costly_walls), wall(X,Y)
    }.

:- optimal_score(Expected),
   objective_score(Actual),
   Actual != Expected.

% ------------------------------------------------------------------------------
% Reachability with the selected walls
% ------------------------------------------------------------------------------

% A wall blocks entering a cell, including through a portal.
reach(horse,X,Y) :- horse(X,Y).
reach(horse,X2,Y2) :-
    reach(horse,X1,Y1),
    adj(X1,Y1,X2,Y2),
    not wall(X2,Y2).
reach(horse,X2,Y2) :-
    reach(horse,X1,Y1),
    portal_edge(X1,Y1,X2,Y2),
    not wall(X2,Y2).

reach(unicorn,X,Y) :- unicorn(X,Y).
reach(unicorn,X2,Y2) :-
    reach(unicorn,X1,Y1),
    adj(X1,Y1,X2,Y2),
    not wall(X2,Y2).
reach(unicorn,X2,Y2) :-
    reach(unicorn,X1,Y1),
    portal_edge(X1,Y1,X2,Y2),
    not wall(X2,Y2).

% Neither animal may reach a boundary tile.
:- reach(horse,X,Y), boundary(X,Y).
:- reach(unicorn,X,Y), boundary(X,Y).

% ------------------------------------------------------------------------------
% Useful walls
% ------------------------------------------------------------------------------

% A selected wall must border the currently reachable horse/unicorn region
% through an ordinary four-neighbour edge. Portal edges intentionally do not
% participate here: walls can only be placed on grass, and grass has no portal
% edge in the puzzle graph.
wall_needs_reachable_neighbour(X,Y) :-
    wall(X,Y),
    reach(horse,NX,NY),
    adj(X,Y,NX,NY).
wall_needs_reachable_neighbour(X,Y) :-
    wall(X,Y),
    reach(unicorn,NX,NY),
    adj(X,Y,NX,NY).

:- wall(X,Y), not wall_needs_reachable_neighbour(X,Y).

% ------------------------------------------------------------------------------
% Mode rules
% ------------------------------------------------------------------------------

% Lovebirds: both animals must be in the same reachable component.
:- mode(lovebirds), unicorn(X,Y), not reach(horse,X,Y).

% Lovers quarrel: their reachable regions must be disjoint.
:- mode(lovers_quarrel), reach(horse,X,Y), reach(unicorn,X,Y).

% ------------------------------------------------------------------------------
% Scored region
% ------------------------------------------------------------------------------

covered(X,Y) :- mode(normal), reach(horse,X,Y).
covered(X,Y) :- mode(costly_walls), reach(horse,X,Y).
covered(X,Y) :- mode(lovebirds), reach(horse,X,Y).
covered(X,Y) :- mode(lovers_quarrel), reach(horse,X,Y).
covered(X,Y) :- mode(lovers_quarrel), reach(unicorn,X,Y).

% Each covered tile contributes exactly once. In lovers_quarrel the regions are
% disjoint by constraint, so the two rules cannot double-count a tile.
#maximize {
    Score@1,tile,X,Y : covered(X,Y), tile_score(X,Y,Score);
    costly_wall_score@1,wall,X,Y : mode(costly_walls), wall(X,Y)
}.

% ------------------------------------------------------------------------------
% Interface for the JavaScript adapter
% ------------------------------------------------------------------------------

#show wall/2.
#show covered/2.
#show reach/3.
#show wall_needs_reachable_neighbour/2.
